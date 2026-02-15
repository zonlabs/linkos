import express, { type Request, type Response } from 'express';
import { Gateway } from '@link-os/core';
import { TelegramClient } from '@link-os/telegram';
import { WhatsAppClient } from '@link-os/whatsapp';
import type { ConnectionConfig } from '@link-os/types';
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
async function startClient(config: ConnectionConfig) {
    let client;
    if (config.platform === 'telegram') {
        client = new TelegramClient({ token: config.token });
    } else {
        client = new WhatsAppClient({
            sessionId: config.userId || `session_${Date.now()}`
        });
    }

    const connectionObj = { client, config, status: { type: 'initializing' } };
    connections.set(config.id, connectionObj);

    // Listen for status updates
    client.on('status', (status: { type: string; data?: any }) => {
        console.log(`📡 Status update for ${config.id}:`, status);
        connectionObj.status = status;
    });

    // Add to gateway
    await gateway.addConnection(client, config);
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
            for (const row of data) {
                try {
                    console.log(`🔌 Restoring ${row.platform} connection: ${row.id}`);
                    await startClient({
                        id: row.id,
                        platform: row.platform,
                        token: row.token,
                        agentUrl: row.agent_url || process.env.AGENT_URL || 'http://127.0.0.1:8001/agent',
                        userId: row.user_id
                    });
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
        const { platform, token, userId, connectionId: providedId } = req.body;

        if (!platform || (platform !== 'whatsapp' && !token)) {
            res.status(400).json({ error: 'Missing platform or token' });
            return;
        }

        if (platform !== 'telegram' && platform !== 'whatsapp') {
            res.status(400).json({ error: 'Unsupported platform. Supported: telegram, whatsapp' });
            return;
        }

        const connectionId = providedId || `${platform}_${Date.now()}`;
        const config: ConnectionConfig = {
            id: connectionId,
            platform,
            token,
            agentUrl: process.env.AGENT_URL || 'http://127.0.0.1:8001/agent',
            userId: userId
        };

        // Start client and add to gateway
        await startClient(config);

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
                status: 'active'
            });

        if (dbError) {
            console.error('❌ Failed to persist connection to Supabase:', dbError.message);
        } else {
            console.log(`✅ Successfully persisted ${connectionId} to Supabase.`);
        }

        res.status(201).json({
            id: connectionId,
            platform,
            status: 'active'
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
                status: activeConn ? activeConn.status.type : 'inactive',
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
    const connection = connections.get(req.params.id);
    if (!connection) {
        res.status(404).json({ error: 'Connection not found' });
        return;
    }
    res.json(connection.status);
});

/**
 * Delete a connection
 */
app.delete('/connections/:id', async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const connection = connections.get(id);

        if (!connection) {
            res.status(404).json({ error: 'Connection not found' });
            return;
        }

        await gateway.removeConnection(id);
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
