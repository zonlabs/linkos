import { TelegramClient } from '@link-os/telegram';
import { WhatsAppClient } from '@link-os/whatsapp';
import { DiscordClient } from '@link-os/discord';
import { SlackClient } from '@link-os/slack';
import type { ConnectionConfig, BaseMessage } from '@link-os/types';
import { AgentProxy } from '@link-os/core';
import { supabase } from '../lib/supabase.js';
import type { HubContext, ConnectionObject } from '../types.js';

/**
 * Register client event listeners
 */
export function registerClientListeners(conn: ConnectionObject) {
    const { client, agent, config } = conn;

    client.on('status', async (status: any) => {
        conn.status = status;

        // Persist final states to DB (skip transient states like 'qr', 'initializing') // TODO: db calls this keeps firing on restart. 
        // if (config.channel === 'whatsapp') {
        //     if (status.type === 'connected') {
        //         await supabase.from('connections').update({ status: 'active' }).eq('id', config.id);
        //         console.log(`[Hub] ✅ WhatsApp ${config.id} connected — DB updated to 'active'.`);
        //     } else if (status.type === 'stopped' || status.type === 'error') {
        //         await supabase.from('connections').update({ status: 'stopped' }).eq('id', config.id);
        //     }
        // }
    });

    client.on('message', async (message: BaseMessage) => {
        try {
            console.log(`[Hub] 📥 Routing message from ${message.channel} (${message.userId}) | Session: ${message.sessionId}`);

            // Get or create isolated session for this user
            let session = conn.sessionMap.get(message.sessionId);
            if (!session) {
                console.log(`[Hub] 👤 Creating new isolated agent session for: ${message.sessionId}`);
                session = agent.createSession(message.sessionId);
                conn.sessionMap.set(message.sessionId, session);
            }

            const response = await session.sendMessage(message);
            if (response.content) {
                await client.sendMessage(message.userId, response.content);
            } else {
                console.warn(`[Hub] ⚠️ Agent returned empty content for ${message.userId}`);
            }
        } catch (error: any) {
            console.error(`[Hub] ❌ Routing/Agent error for ${message.userId}:`, error.message || error);
            const errorMessage = `⚠️ **Agent Error**\n${error.message || 'An unexpected error occurred.'}`;
            try {
                await client.sendMessage(message.userId, errorMessage);
            } catch (sendErr: any) {
                console.error(`[Hub] ❌ Failed to send error message to channel:`, sendErr.message || sendErr);
            }
        }
    });
}

/**
 * Create specific channel client
 */
export function createChannelClient(config: ConnectionConfig) {
    if (config.channel === 'telegram') {
        return new TelegramClient({ token: config.token });
    }
    if (config.channel === 'discord') {
        return new DiscordClient({
            token: config.token,
            respondToAll: (config.metadata?.respondToAll as boolean) ?? false,
        });
    }
    if (config.channel === 'slack') {
        const meta = config.metadata || {};
        return new SlackClient({
            token: config.token,
            signingSecret: meta.signingSecret as string,
            appToken: meta.appToken as string,
        });
    }
    return new WhatsAppClient({
        sessionId: config.userId || config.id,
        allowedContexts: (config.metadata?.allowedContexts as any[]) || []
    } as any);
}

/**
 * Fetch user's active LLM provider and keys
 */
export async function fetchUserLlmConfig(userId?: string) {
    if (!userId) return null;
    const { data } = await supabase
        .from('user_settings')
        .select('llm_keys, active_provider')
        .eq('user_id', userId)
        .maybeSingle();

    if (data?.llm_keys && data?.active_provider) {
        const providerKey = data.llm_keys[data.active_provider];
        if (providerKey) {
            return {
                llm_provider: data.active_provider,
                llm_api_key: providerKey
            };
        }
    }
    return null;
}

/**
 * Start a channel client and add it to the gateway
 */
export async function startClient(
    config: ConnectionConfig,
    context: HubContext,
    autoStart = true
) {
    const { connections, gateway, agentClient } = context;
    console.log(`🚀 [Hub] Starting client for ${config.channel} (ID: ${config.id})`);

    try {
        const client = createChannelClient(config);
        const sessionId = config.userId || config.id;
        const sessionAgent = agentClient.createSession(sessionId, { agentUrl: config.agentUrl });

        const connectionObject: ConnectionObject = {
            client,
            config,
            status: { type: config.channel === 'whatsapp' && !autoStart ? 'stopped' : 'initializing' },
            lastPollAt: Date.now(),
            agent: sessionAgent,
            sessionMap: new Map<string, AgentProxy>(),
            llmConfig: null
        };

        connections.set(config.id, connectionObject);

        connectionObject.llmConfig = await fetchUserLlmConfig(config.userId);
        registerClientListeners(connectionObject);
        await gateway.addConnection(client, config);

        if (autoStart) {
            await client.start();
        }

        return connectionObject;
    } catch (error: any) {
        console.error(`❌ [Hub] Failed to start client for ${config.id}:`, error.message);
        throw error;
    }
}

/**
 * Initialize existing connections from Supabase
 */
export async function initializeConnections(context: HubContext) {
    console.log('🔄 Restoring connections from Supabase...');
    try {
        const { data, error } = await supabase.from('connections').select('*');
        if (error) throw error;

        if (data && data.length > 0) {
            const fs = await import('fs/promises');
            for (const row of data) {
                try {
                    let autoStart = true;
                    const channel = row.channel || row.platform;

                    if (channel === 'whatsapp') {
                        const sessionId = row.user_id || row.id;
                        const authPath = `.auth/whatsapp/${sessionId}/creds.json`;
                        try {
                            await fs.access(authPath);
                        } catch (e) {
                            autoStart = false;
                        }
                    }

                    await startClient({
                        id: row.id,
                        channel: channel,
                        token: row.token,
                        agentUrl: row.agent_url || (process.env.AGENT_URL as string),
                        userId: row.user_id,
                        metadata: row.metadata
                    }, context, autoStart);
                } catch (e) {
                    console.error(`❌ Failed to restore connection ${row.id}:`, e);
                }
            }
        }
    } catch (e) {
        console.error('❌ Unexpected error during initialization:', e);
    }
}
