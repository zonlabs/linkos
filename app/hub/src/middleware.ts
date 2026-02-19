import { from, of } from 'rxjs';
import { switchMap, catchError } from 'rxjs/operators';
import { supabase } from './lib/supabase.js';
import type { ConnectionMap } from './types.js';

/**
 * Resolve connection object from the session ID
 */
export function resolveConnection(fullSessionId: string, connections: ConnectionMap) {
    console.log(`[Hub:Resolver] 🔍 Resolving for: ${fullSessionId}`);
    // Try to strip potential timestamp suffix (e.g. sessionID_timestamp)
    const parts = fullSessionId.split('_');
    const originalSessionId = parts.length > 1 ? parts.slice(0, -1).join('_') : fullSessionId;

    for (const [id, conn] of connections.entries()) {
        const connSessionId = conn.config.userId || conn.config.id;
        if (connSessionId === originalSessionId || connSessionId === fullSessionId) {
            console.log(`[Hub:Resolver] ✅ Found connection: ${id} (Session: ${connSessionId})`);
            return conn;
        }
    }
    console.warn(`[Hub:Resolver] ❌ No connection found for: ${fullSessionId}`);
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

    if (!conn?.config.userId) {
        console.log(`[RateLimit] ⏩ Skipping (No userId or connection) for ${input.threadId}`);
        return next.run(input);
    }

    const config = conn.config;
    const DAILY_LIMIT = (config.metadata as any)?.daily_request_limit || 50;
    const today = new Date().toISOString().split('T')[0];

    console.log(`[RateLimit] 📊 Checking usage for ${config.userId} (Limit: ${DAILY_LIMIT})`);

    const checkUsage = async () => {
        const { data, error } = await supabase
            .from('user_daily_usage')
            .select('request_count')
            .eq('user_id', config.userId)
            .eq('date', today)
            .maybeSingle();

        if (error) {
            console.error(`[RateLimit] ❌ Error checking usage:`, error.message);
            throw error;
        }

        const count = data?.request_count || 0;
        console.log(`[RateLimit] 📉 Current usage: ${count}/${DAILY_LIMIT}`);

        if (count >= DAILY_LIMIT) {
            throw new Error(`Rate limit exceeded (${count}/${DAILY_LIMIT})`);
        }
        return count;
    };

    const incrementUsage = async () => {
        console.log(`[RateLimit] ⬆️ Incrementing usage for ${config.userId}...`);
        const { error } = await supabase.rpc('increment_usage', {
            user_id_param: config.userId,
            date_param: today
        });

        if (error) {
            console.error(`[RateLimit] ❌ RPC Error for ${config.userId}:`, error.message || error);
        } else {
            console.log(`[RateLimit] ✅ successfully incremented for ${config.userId}`);
        }
    };

    return from(checkUsage()).pipe(
        switchMap((currentCount) => {
            // Async increment, don't block response
            incrementUsage().catch((e: any) => console.error('[RateLimit] Async increment failed:', e));
            return next.run(input);
        }),
        catchError((err: any) => {
            console.error(`[RateLimit] 🛑 Blocked request for ${config.userId}:`, err.message);
            return of({
                type: 'error',
                content: `⚠️ **Rate Limit Exceeded**\nYou have used your daily limit of ${DAILY_LIMIT} requests.\nPlease upgrade your plan or wait until tomorrow.`
            });
        })
    );
};
