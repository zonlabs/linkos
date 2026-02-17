import express, { type Request, type Response } from 'express';
import cors from 'cors';
import { createClient } from '@supabase/supabase-js';
import { Gateway, AGUIClient } from '@link-os/core';
import { TelegramClient } from '@link-os/telegram';
import { WhatsAppClient } from '@link-os/whatsapp';
import type { ConnectionConfig } from '@link-os/types';
import { from, of, throwError } from 'rxjs';
import { switchMap, tap, catchError } from 'rxjs/operators';
import dotenv from 'dotenv';
import { supabase } from './lib/supabase.js';

dotenv.config();

const app = express();
app.use(express.json());

const gateway = new Gateway({
    agentUrl: process.env.AGENT_URL || 'http://127.0.0.1:8001/agent'
});

// Debug Logger Middleware
app.use((req, res, next) => {
    console.log(`📡 [Hub Incoming] ${req.method} ${req.url}`);
    next();
});

// Store active connections
const connections = new Map<string, {
    client: TelegramClient | WhatsAppClient;
    config: ConnectionConfig;
    status: { type: string; data?: any };
}>();

/**
 * Start a platform client and add it to the gateway
 */
async function startClient(config: ConnectionConfig, autoStart = true) {
    let client;
    if (config.platform === 'telegram') {
        client = new TelegramClient({ token: config.token });
        autoStart = true; // Telegram always auto-starts
    } else {
        // allowedJids in metadata is now the rich object array
        const allowedContexts = (config.metadata?.allowedContexts as any[]) || [];
        client = new WhatsAppClient({
            sessionId: config.userId || config.id,
            allowedContexts
        } as any);
    }

    const connectionObj: { client: any; config: ConnectionConfig; status: { type: string; data?: any } } = {
        client,
        config,
        status: { type: (config.platform === 'whatsapp' && !autoStart) ? 'stopped' : 'initializing' }
    };

    if (config.platform === 'telegram') {
        connectionObj.status = { type: 'active' };
    }

    connections.set(config.id, connectionObj);

    // Listen for status updates
    client.on('status', (status: { type: string; data?: any }) => {
        console.log(`📡 Status update for ${config.id}:`, status);
        connectionObj.status = status;
    });

    // Start client if requested
    if (autoStart) {
        await client.start();
    } else {
        console.log(`⏳ [Hub] Waiting for manual start for ${config.id} (${config.platform})`);
    }

    // Create middleware to inject LLM config
    const llmMiddleware = (input: any, next: any) => {
        const llmConfig = (config.metadata as any)?.llm_config;
        if (llmConfig) {
            console.log(`[Hub] 💉 Injecting LLM Config for ${config.id}: ${llmConfig.llm_provider}`);
            return next.run({
                ...input,
                state: {
                    ...input.state,
                    llm_config: llmConfig
                }
            });
        }
        return next.run(input);
    };

    // Create Rate Limit Middleware
    // Reads limit from metadata (set during connection creation) or defaults to 100
    const DAILY_LIMIT = (config.metadata as any)?.daily_request_limit || 100;

    const rateLimitMiddleware = (input: any, next: any) => {
        // If no user_id (anonymous), skip
        if (!config.userId) return next.run(input);

        // Check usage for TODAY
        const checkUsage = async () => {
            const today = new Date().toISOString().split('T')[0];
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

        // Increment usage
        const incrementUsage = async () => {
            const today = new Date().toISOString().split('T')[0];
            // Call the secure RPC function
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
                // If check passes, run next middleware

                // Fire and forget increment usage ONCE (Pay to proceed)
                incrementUsage().catch((e: any) => console.error('Failed to increment usage:', e));

                return next.run(input);
            }),
            catchError((err: any) => {
                console.error(`[RateLimit] Blocked request for ${config.userId}:`, err.message);
                // Return a structured error response that the agent/frontend can display
                return of({
                    type: 'error',
                    content: `⚠️ **Rate Limit Exceeded**\nYou have used your daily limit of ${DAILY_LIMIT} requests.\nPlease upgrade your plan or wait until tomorrow.`
                });
            })
        );
    };

    // Add to gateway with middlewares
    await gateway.addConnection(client, config, [llmMiddleware, rateLimitMiddleware]);
    return connectionObj;
}

/**
 * Initialize existing connections from Supabase
 */
async function initializeConnections() {
    console.log('🔄 Restoring connections from Supabase...');
    try {
        const { data, error } = await supabase
            .from('connections')
            .select('*');

        if (error) {
            console.error('❌ Failed to fetch connections from Supabase:', error.message);
            return;
        }

        if (data && data.length > 0) {
            console.log(`📂 Found ${data.length} connections to restore.`);
            const fs = await import('fs/promises');
            for (const row of data) {
                try {
                    console.log(`🔌 Initializing ${row.platform} connection: ${row.id}`);

                    let autoStart = true;
                    if (row.platform === 'whatsapp') {
                        // Only auto-start WhatsApp if creds exist
                        const sessionId = row.user_id || row.id;
                        const authPath = `.auth/whatsapp/${sessionId}/creds.json`;
                        try {
                            await fs.access(authPath);
                            console.log(`📦 Found existing credentials for ${row.id}. Auto-starting.`);
                        } catch (e) {
                            console.log(`⚠️ No existing credentials for ${row.id}. Manual start required.`);
                            autoStart = false;
                        }
                    }

                    await startClient({
                        id: row.id,
                        platform: row.platform,
                        token: row.token,
                        agentUrl: row.agent_url || process.env.AGENT_URL || 'http://127.0.0.1:8001/agent',
                        userId: row.user_id,
                        metadata: row.metadata // Ensure metadata is restored
                    }, autoStart);
                } catch (e) {
                    console.error(`❌ Failed to restore connection ${row.id}:`, e);
                }
            }
        } else {
            console.log('✅ No connections found in database to restore.');
        }
    } catch (e) {
        console.error('❌ Unexpected error during initialization:', e);
    }
}

/**
 * Health check endpoint
 */
app.get('/health', (req: Request, res: Response) => {
    res.json({ status: 'ok', connections: connections.size });
});

/**
 * Create a new connection
 */
app.post('/connections', async (req: Request, res: Response) => {
    try {
        const { platform, token, userId, agentUrl: providedAgentUrl, connectionId: providedId, metadata } = req.body;

        if (!platform || (platform !== 'whatsapp' && !token)) {
            res.status(400).json({ error: 'Missing platform or token' });
            return;
        }

        if (platform !== 'telegram' && platform !== 'whatsapp') {
            res.status(400).json({ error: 'Unsupported platform. Supported: telegram, whatsapp' });
            return;
        }

        const connectionId = providedId || `${platform}_${Date.now()}`;

        // Fetch existing metadata to avoid data loss if upserting
        const { data: existingConn } = await supabase
            .from('connections')
            .select('metadata')
            .eq('id', connectionId)
            .maybeSingle();

        // Merge provided metadata with existing metadata
        let finalMetadata = {
            ...(existingConn?.metadata || {}),
            ...(metadata || {})
        };

        if (userId) {
            // Fetch global settings from dedicated user_settings table
            const { data: settings } = await supabase
                .from('user_settings')
                .select('*')
                .eq('user_id', userId)
                .maybeSingle();

            if (settings?.active_provider && settings?.llm_keys?.[settings.active_provider]) {
                finalMetadata = {
                    ...finalMetadata,
                    llm_config: {
                        llm_provider: settings.active_provider,
                        llm_api_key: settings.llm_keys[settings.active_provider]
                    },
                    // Store daily limit in metadata for quick access
                    daily_request_limit: settings.daily_request_limit || 100
                };
                console.log(`✅ Applied global key & limit (${settings.daily_request_limit || 100}) for: ${settings.active_provider}`);
            }
        }

        const config: ConnectionConfig = {
            id: connectionId,
            platform,
            token,
            agentUrl: providedAgentUrl || process.env.AGENT_URL || 'http://127.0.0.1:8001/agent',
            userId: userId,
            metadata: finalMetadata
        };

        // Start client and add to gateway
        const connectionObj = await startClient(config);

        // Persist to Supabase
        console.log(`💾 Attempting to persist ${platform} connection ${connectionId} to Supabase...`);
        const { error: dbError } = await supabase
            .from('connections')
            .upsert({
                id: connectionId,
                platform,
                token,
                user_id: userId,
                agent_url: config.agentUrl,
                status: platform === 'whatsapp' ? 'initializing' : 'active',
                metadata: config.metadata
            });

        if (dbError) {
            console.error('❌ Failed to persist connection to Supabase:', dbError.message);
        } else {
            console.log(`✅ Successfully persisted ${connectionId} to Supabase.`);
        }

        res.status(201).json({
            id: connectionId,
            platform,
            status: connectionObj.status.type
        });
    } catch (error) {
        console.error('Error creating connection:', error);
        res.status(500).json({
            error: error instanceof Error ? error.message : 'Unknown error'
        });
    }
});

/**
 * List all connections belonging to a user
 */
app.get('/connections', async (req: Request, res: Response) => {
    const { userId } = req.query;

    if (!userId) {
        res.status(400).json({ error: 'Missing userId query parameter' });
        return;
    }

    console.log(`🔍 [Hub] Fetching connections for user: ${userId}`);

    try {
        // Fetch from Supabase as source of truth for the list
        const { data: dbConns, error } = await supabase
            .from('connections')
            .select('*')
            .eq('user_id', userId);

        if (error) throw error;

        console.log(`✅ [Hub] Found ${dbConns.length} connections for user: ${userId}`);

        // Map to standard camelCase and enrich with live status from memory
        const conns = dbConns.map(conn => {
            const activeConn = connections.get(conn.id);
            return {
                id: conn.id,
                platform: conn.platform,
                userId: conn.user_id,
                agentUrl: conn.agent_url,
                metadata: conn.metadata, // Pass metadata to frontend
                status: activeConn ? activeConn.status.type : conn.status || 'inactive', // Use DB status if no active connection
                createdAt: conn.created_at
            };
        });

        res.json(conns);
    } catch (error: any) {
        console.error('❌ Failed to fetch connections:', error.message);
        res.status(500).json({ error: error.message });
    }
});

/**
 * Get connection status
 */
app.get('/connections/:id/status', (req: Request, res: Response) => {
    const connection = connections.get(req.params.id as string);
    if (!connection) {
        res.status(404).json({ error: 'Connection not found' });
        return;
    }
    res.json(connection.status);
});

/**
 * Get connection contexts (groups/chats)
 */
app.get('/connections/:id/contexts', async (req: Request, res: Response) => {
    const connection = connections.get(req.params.id as string);
    if (!connection) {
        res.status(404).json({ error: 'Connection not found' });
        return;
    }

    try {
        if ('getAvailableContexts' in connection.client && typeof (connection.client as any).getAvailableContexts === 'function') {
            const contexts = await (connection.client as any).getAvailableContexts();
            res.json(contexts);
        } else {
            res.json([]);
        }
    } catch (error) {
        console.error('Error fetching contexts:', error);
        res.status(500).json({ error: 'Failed to fetch contexts' });
    }
});

/**
 * Update connection configuration
 */
app.patch('/connections/:id', async (req: Request, res: Response) => {
    try {
        const { id } = req.params as any;
        const { metadata } = req.body;

        if (!metadata) {
            res.status(400).json({ error: 'Missing metadata' });
            return;
        }

        console.log(`🔍 [Hub PATCH] Updating connection ${id}`);

        // 1. Update in Supabase
        const { data: currentConn, error: fetchError } = await supabase
            .from('connections')
            .select('metadata')
            .eq('id', id)
            .single();

        if (fetchError) {
            console.error(`❌ [Hub PATCH] Supabase fetch error for ${id}:`, fetchError);
            res.status(404).json({ error: 'Connection not found', details: fetchError });
            return;
        }

        const newMetadata = { ...currentConn.metadata, ...metadata };

        const { error: dbError } = await supabase
            .from('connections')
            .update({ metadata: newMetadata })
            .eq('id', id);

        if (dbError) {
            console.error('❌ Failed to update connection in Supabase:', dbError.message);
            res.status(500).json({ error: dbError.message });
            return;
        }

        // 2. Update active connection if it exists
        const activeConn = connections.get(id);
        if (activeConn && activeConn.client.platform === 'whatsapp') {
            console.log(`🔄 Updating configuration for active connection ${id}`);
            // Check if updateConfiguration exists
            if ('updateConfiguration' in activeConn.client && typeof (activeConn.client as any).updateConfiguration === 'function') {
                await (activeConn.client as any).updateConfiguration({
                    allowedContexts: newMetadata.allowedContexts // Pass rich objects as allowedContexts
                });
            }
            // Update local config copy
            activeConn.config.metadata = newMetadata;
        }

        res.json({ status: 'updated', metadata: newMetadata });
    } catch (error) {
        console.error('Error updating connection:', error);
        res.status(500).json({
            error: error instanceof Error ? error.message : 'Unknown error'
        });
    }
});

/**
 * Delete a connection
 */
app.delete('/connections/:id', async (req: Request, res: Response) => {
    try {
        const { id } = req.params as any;
        const connection = connections.get(id);

        if (!connection) {
            res.status(404).json({ error: 'Connection not found' });
            return;
        }

        if (connection.client.platform === 'whatsapp') {
            console.log(`🗑️ Cleaning up session for ${id}`);
            // Check if deleteSession exists (it's in the class but might not be in the interface yet)
            if ('deleteSession' in connection.client && typeof (connection.client as any).deleteSession === 'function') {
                await (connection.client as any).deleteSession();
            }
        }

        try {
            await gateway.removeConnection(id);
        } catch (e) {
            console.error(`⚠️ Error during gateway cleanup for ${id}:`, e);
            // We still proceed to remove from memory and DB
        }
        connections.delete(id);

        // Remove from Supabase
        const { error: dbError } = await supabase
            .from('connections')
            .delete()
            .eq('id', id);

        if (dbError) {
            console.error('⚠️ Failed to delete connection from Supabase:', dbError.message);
        }

        res.json({ status: 'deleted' });
    } catch (error) {
        console.error('Error deleting connection:', error);
        res.status(500).json({
            error: error instanceof Error ? error.message : 'Unknown error'
        });
    }
});

/**
 * Stop a connection
 */
app.post('/connections/:id/stop', async (req: Request, res: Response) => {
    try {
        const { id } = req.params as any;
        const connection = connections.get(id);

        if (!connection) {
            res.status(404).json({ error: 'Connection not found' });
            return;
        }

        console.log(`🛑 Stopping connection ${id}`);
        connection.client.stop().catch(e => console.error(`Error stopping ${id}:`, e));
        connection.status = { type: 'stopped' };
        console.log(`✅ Connection ${id} stop command issued`);

        res.json({ status: 'stopped' });
    } catch (error) {
        console.error('Error stopping connection:', error);
        res.status(500).json({ error: 'Failed to stop connection' });
    }
});

/**
 * Trigger a QR scan for a connection
 */
app.post('/connections/:id/scan-qr', async (req: Request, res: Response) => {
    try {
        const { id } = req.params as any;
        const connection = connections.get(id as string);

        if (!connection) {
            res.status(404).json({ error: 'Connection not found' });
            return;
        }

        console.log(`📱 Triggering QR scan for connection ${id}`);
        connection.status = { type: 'initializing' };
        connection.client.start().catch(e => console.error(`Error starting ${id}:`, e));
        console.log(`✅ Connection ${id} QR scan command issued`);

        res.json({ status: 'started' });
    } catch (error) {
        console.error('Error restarting connection:', error);
        res.status(500).json({ error: 'Failed to restart connection' });
    }
});

// Start server
const PORT = Number(process.env.PORT) || 8081;
app.listen(PORT, '0.0.0.0', async () => {
    console.log(`🚀 Linkos Hub (TypeScript) running on http://0.0.0.0:${PORT}`);
    console.log(`📡 Agent URL: ${process.env.AGENT_URL || 'http://127.0.0.1:8001/agent'}`);

    // Restore connections on startup
    await initializeConnections();
});

// Global process error handlers to prevent service crashes
process.on('unhandledRejection', (reason, promise) => {
    console.error('🔥 CRITICAL: Unhandled Rejection at:', promise, 'reason:', reason);
    // Be careful NOT to crash, just log and keep running
});

process.on('uncaughtException', (error) => {
    console.error('🔥 CRITICAL: Uncaught Exception:', error);
    // Depending on the error, we might want to exit, but for Signal issues we want to survive
    if (error.message?.includes('No sessions') || error.message?.includes('Bad MAC')) {
        console.warn('⚠️ Recovering from Signal session error. Service remains online.');
    } else {
        process.exit(1);
    }
});

// Graceful shutdown
process.on('SIGTERM', async () => {
    console.log('Received SIGTERM, shutting down gracefully...');
    await gateway.stop();
    process.exit(0);
});
