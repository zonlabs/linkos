import express, { type Request, type Response } from 'express';
import cors from 'cors';
import { Gateway, AgentProxy } from '@link-os/core';
import { TelegramClient } from '@link-os/telegram';
import { WhatsAppClient } from '@link-os/whatsapp';
import { DiscordClient } from '@link-os/discord';
import { SlackClient } from '@link-os/slack';
import type { ConnectionConfig, BaseMessage } from '@link-os/types';
import { from, of } from 'rxjs';
import { switchMap, catchError } from 'rxjs/operators';
import { supabase } from './lib/supabase.js';
import dotenv from 'dotenv';
dotenv.config();

// Global Error Handlers to prevent Hub crash on unhandled async errors (e.g. from undici/agent communication)
process.on('uncaughtException', (err) => {
    console.error('🔥 [Hub] CRITICAL: Uncaught Exception:', err);
    // In a production app, you might want to restart, but here we prioritize staying alive
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('🔥 [Hub] CRITICAL: Unhandled Rejection at:', promise, 'reason:', reason);
});


const app = express();
app.use(express.json());
app.use(cors());

const agentClient = new AgentProxy({
    url: process.env.AGENT_URL || '', // Must be set in .env
    headers: process.env.AGENT_TOKEN ? {
        'Authorization': `Bearer ${process.env.AGENT_TOKEN}`
    } : undefined
});

const gateway = new Gateway({ agentClient });

// Debug Logger Middleware
app.use((req, res, next) => {
    console.log(`📡 [Hub Incoming] ${req.method} ${req.url}`);
    next();
});

// Store active connections
const connections = new Map<string, {
    client: TelegramClient | WhatsAppClient | DiscordClient | SlackClient;
    config: ConnectionConfig;
    status: { type: string; data?: any };
    llmConfig?: any;
    agent: AgentProxy;
}>();

// ===============================
// Global Middlewares
// ===============================

/**
 * Resolve connection object from the session ID
 */
function resolveConnection(fullSessionId: string) {
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
const llmMiddleware = (input: any, next: any) => {
    const conn = resolveConnection(input.threadId);

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
const rateLimitMiddleware = (input: any, next: any) => {
    const conn = resolveConnection(input.threadId);
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

// Register Global Middlewares
agentClient.use(llmMiddleware);
agentClient.use(rateLimitMiddleware);

/**
 * Start a channel client and add it to the gateway
 */
async function startClient(config: ConnectionConfig, autoStart = true) {
    // 1. Initialize Channel Client
    const client = createChannelClient(config);

    // 2. Initialize Agent Session
    const sessionId = config.userId || config.id;
    const sessionAgent = agentClient.createSession(sessionId, { agentUrl: config.agentUrl });

    // 3. Create Connection Object
    const connectionObj = {
        client,
        config,
        agent: sessionAgent,
        status: {
            type: config.channel === 'whatsapp' && !autoStart ? 'stopped' : 'initializing'
        } as { type: string; data?: any },
        llmConfig: null as any
    };

    if (['telegram', 'discord', 'slack'].includes(config.channel)) connectionObj.status.type = 'active';
    connections.set(config.id, connectionObj);

    // 4. Load & Inject LLM Config
    connectionObj.llmConfig = await fetchUserLlmConfig(config.userId);

    // 5. Setup Listeners
    registerClientListeners(connectionObj);

    // 6. Gateway Management
    await gateway.addConnection(client, config);
    if (autoStart) await client.start();

    return connectionObj;
}

/** 
 * Helper: Create specific channel client 
 */
function createChannelClient(config: ConnectionConfig) {
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
    // Default: WhatsApp
    return new WhatsAppClient({
        sessionId: config.userId || config.id,
        allowedContexts: (config.metadata?.allowedContexts as any[]) || []
    } as any);
}

/** 
 * Helper: Fetch user's active LLM provider and keys 
 */
async function fetchUserLlmConfig(userId?: string) {
    if (!userId) return null;
    const { data } = await supabase
        .from('user_settings')
        .select('llm_keys, active_provider')
        .eq('user_id', userId)
        .maybeSingle();

    if (data?.llm_keys && data?.active_provider) {
        const providerKey = data.llm_keys[data.active_provider];
        if (providerKey) {
            console.log(`[Hub] 🔑 Found LLM config for user ${userId}: ${data.active_provider}`);
            return {
                llm_provider: data.active_provider,
                llm_api_key: providerKey
            };
        }
    }
    return null;
}

/** 
 * Helper: register client event listeners 
 */
function registerClientListeners(conn: any) {
    const { client, agent, config } = conn;

    client.on('status', (status: any) => {
        conn.status = status;
    });

    client.on('message', async (message: BaseMessage) => {
        try {
            console.log(`[Hub] 📥 Routing message from ${message.channel} (${message.userId})`);
            const response = await agent.sendMessage(message);
            if (response.content) {
                await client.sendMessage(message.userId, response.content);
            } else {
                console.warn(`[Hub] ⚠️ Agent returned empty content for ${message.userId}`);
            }
        } catch (error: any) {
            console.error(`[Hub] ❌ Routing/Agent error for ${message.userId}:`, error.message || error);
            if (error.stack) {
                console.error(`[Hub] 🕵️ Error Stack:`, error.stack);
            }

            const errorMessage = `⚠️ **Agent Error**\n${error.message || 'An unexpected error occurred.'}`;
            try {
                console.log(`[Hub] 📣 Sending error to channel for ${message.userId}...`);
                await client.sendMessage(message.userId, errorMessage);
            } catch (sendErr: any) {
                console.error(`[Hub] ❌ Failed to send error message to channel:`, sendErr.message || sendErr);
            }
        }
    });
}


/**
 * Initialize existing connections from Supabase
 */
async function initializeConnections() {
    console.log('🔄 Restoring connections from Supabase...');
    try {
        const { data, error } = await supabase.from('connections').select('*');
        if (error) throw error;

        if (data && data.length > 0) {
            const fs = await import('fs/promises');
            for (const row of data) {
                try {
                    let autoStart = true;
                    // Note: 'channel' column in DB needs to be migrated or mapped
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
                    // Discord and Slack use tokens directly — always auto-start like Telegram
                    // (no local auth file needed)

                    await startClient({
                        id: row.id,
                        channel: channel,
                        token: row.token,
                        agentUrl: row.agent_url || process.env.AGENT_URL,
                        userId: row.user_id,
                        metadata: row.metadata
                    }, autoStart);
                } catch (e) {
                    console.error(`❌ Failed to restore connection ${row.id}:`, e);
                }
            }
        }
    } catch (e) {
        console.error('❌ Unexpected error during initialization:', e);
    }
}

/**
 * API Endpoints
 */
app.get('/health', (req: Request, res: Response) => {
    res.json({ status: 'ok', connections: connections.size });
});

app.post('/connections', async (req: Request, res: Response) => {
    try {
        const { channel, token, userId, agentUrl, connectionId, metadata } = req.body;
        const id = connectionId || `${channel}_${Date.now()}`;

        // Reject if another active connection already uses this token
        for (const conn of connections.values()) {
            if (conn.config.token === token && conn.config.channel === channel) {
                return res.status(409).json({ error: `This ${channel} bot token is already connected. Each bot token can only have one active connection.` });
            }
        }

        const config: ConnectionConfig = {
            id,
            channel,
            token,
            agentUrl: agentUrl || process.env.AGENT_URL, userId,
            metadata
        };

        const connectionObj = await startClient(config);

        await supabase.from('connections').upsert({
            id,
            platform: channel,
            token,
            user_id: userId,
            agent_url: config.agentUrl, status: channel === 'whatsapp' ? 'initializing' : 'active',
            metadata: config.metadata
        });

        res.status(201).json({ id, channel, status: connectionObj.status.type });

    } catch (error) {
        res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
});

app.get('/connections', async (req: Request, res: Response) => {
    const { userId } = req.query;
    if (!userId) return res.status(400).json({ error: 'Missing userId' });

    try {
        const { data: dbConns, error } = await supabase.from('connections').select('*').eq('user_id', userId);
        if (error) throw error;

        const conns = dbConns.map(conn => {
            const activeConn = connections.get(conn.id);
            return {
                id: conn.id,
                channel: conn.platform, // Map DB 'platform' to 'channel'
                userId: conn.user_id,
                status: activeConn ? activeConn.status.type : conn.status || 'inactive',
                metadata: conn.metadata
            };
        });
        res.json(conns);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/connections/:id/status', (req: Request, res: Response) => {
    const connection = connections.get(req.params.id);
    if (!connection) return res.status(404).json({ error: 'Not found' });
    res.json(connection.status);
});

app.post('/connections/:id/scan-qr', async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const connection = connections.get(id);
        if (!connection) return res.status(404).json({ error: 'Connection not found' });

        await connection.client.start();
        res.json({ status: 'starting' });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/connections/:id/stop', async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const connection = connections.get(id);
        if (!connection) return res.status(404).json({ error: 'Connection not found' });

        await connection.client.stop();
        connection.status = { type: 'stopped' };
        res.json({ status: 'stopped' });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/connections/:id/restart', async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const connection = connections.get(id);
        if (!connection) return res.status(404).json({ error: 'Connection not found' });

        await connection.client.stop();
        await connection.client.start();
        res.json({ status: 'restarting' });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

app.patch('/connections/:id', async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const { metadata, agentUrl } = req.body;
        const connection = connections.get(id);
        if (!connection) return res.status(404).json({ error: 'Connection not found' });

        // Update in memory
        if (metadata) {
            connection.config.metadata = { ...connection.config.metadata, ...metadata };
        }
        if (agentUrl) {
            connection.config.agentUrl = agentUrl;
        }

        if ('updateConfiguration' in connection.client) {
            const clientConfig: any = {};
            if (metadata?.allowedContexts) {
                clientConfig.allowedContexts = metadata.allowedContexts;
            }
            await (connection.client as any).updateConfiguration(clientConfig);
        }

        // Update in DB
        const updateData: any = {};
        if (metadata) updateData.metadata = connection.config.metadata;
        if (agentUrl) updateData.agent_url = agentUrl;

        const { error } = await supabase
            .from('connections')
            .update(updateData)
            .eq('id', id);

        if (error) throw error;

        res.json({ status: 'updated', config: connection.config });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/connections/:id/contexts', async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const connection = connections.get(id);
        if (!connection) return res.status(404).json({ error: 'Connection not found' });

        if ('getAvailableContexts' in connection.client) {
            const contexts = await (connection.client as any).getAvailableContexts();
            res.json(contexts);
        } else {
            res.json([]);
        }
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

app.delete('/connections/:id', async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const connection = connections.get(id);
        if (!connection) return res.status(404).json({ error: 'Not found' });

        // Use Gateway to stop connection safely
        await gateway.removeConnection(id);

        if (connection.client.channel === 'whatsapp' && 'deleteSession' in connection.client) {
            await (connection.client as any).deleteSession();
        }

        connections.delete(id);
        await supabase.from('connections').delete().eq('id', id);
        res.json({ status: 'deleted' });
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete' });
    }
});

// Graceful Shutdown
const shutdown = async () => {
    console.log('\n🛑 Shutting down Hub...');
    await gateway.stop();
    process.exit(0);
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

// Start server
const PORT = Number(process.env.PORT) || 8081;
app.listen(PORT, '0.0.0.0', async () => {
    console.log(`🚀 Linkos Hub running on http://0.0.0.0:${PORT}`);
    await initializeConnections();
});
