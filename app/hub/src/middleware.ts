import { from, of } from 'rxjs';
import { switchMap, catchError } from 'rxjs/operators';
import { supabase } from './lib/supabase.js';
import type { ConnectionMap } from './types.js';

/**
 * Resolve connection object from the session ID
 */
export function resolveConnection(fullSessionId: string, connections: ConnectionMap) {
    const originalSessionId = fullSessionId.split('_').slice(0, -1).join('_');

    for (const conn of connections.values()) {
        const connSessionId = conn.config.userId || conn.config.id;
        if (connSessionId === originalSessionId) {
            return conn;
        }
    }
    return null;
}

/**
 * Global LLM Middleware
 */
export const createLlmMiddleware = (connections: ConnectionMap) => (input: any, next: any) => {
    const conn = resolveConnection(input.threadId, connections);

    if (conn?.llmConfig) {
        console.log(`[Hub] 💉 Injecting LLM Config for session ${input.threadId} (${conn.llmConfig.llm_provider})`);
        return next.run({
            ...input,
            state: {
                ...input.state,
                llm_config: conn.llmConfig
            }
        });
    }

    return next.run(input);
};

/**
 * Global Rate Limit Middleware
 */
export const createRateLimitMiddleware = (connections: ConnectionMap) => (input: any, next: any) => {
    const conn = resolveConnection(input.threadId, connections);
    if (!conn?.config.userId) return next.run(input);

    const config = conn.config;
    const DAILY_LIMIT = (config.metadata as any)?.daily_request_limit || 100;
    const today = new Date().toISOString().split('T')[0];

    const checkUsage = async () => {
        const { data, error } = await supabase
            .from('user_daily_usage')
            .select('request_count')
            .eq('user_id', config.userId)
            .eq('date', today)
            .maybeSingle();

        if (error) throw error;
        const count = data?.request_count || 0;

        if (count >= DAILY_LIMIT) {
            throw new Error(`Rate limit exceeded (${count}/${DAILY_LIMIT})`);
        }
        return count;
    };

    const incrementUsage = async () => {
        const { error } = await supabase.rpc('increment_usage', {
            user_id_param: config.userId,
            date_param: today
        });

        if (error) {
            console.error(`[RateLimit] ❌ Failed to update usage for ${config.userId}:`, error);
        } else {
            console.log(`[RateLimit] ✅ Incremented usage for ${config.userId}`);
        }
    };

    return from(checkUsage()).pipe(
        switchMap(() => {
            incrementUsage().catch((e: any) => console.error('Failed to increment usage:', e));
            return next.run(input);
        }),
        catchError((err: any) => {
            console.error(`[RateLimit] Blocked request for ${config.userId}:`, err.message);
            return of({
                type: 'error',
                content: `⚠️ **Rate Limit Exceeded**\nYou have used your daily limit of ${DAILY_LIMIT} requests.\nPlease upgrade your plan or wait until tomorrow.`
            });
        })
    );
};
