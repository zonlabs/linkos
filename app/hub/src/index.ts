import express, { type Request, type Response } from 'express';
import cors from 'cors';
import { Gateway, AgentProxy } from '@link-os/core';
import { supabase } from './lib/supabase.js';
import dotenv from 'dotenv';
import { createLlmMiddleware, createRateLimitMiddleware } from './middleware.js';
import {
    startClient,
    initializeConnections,
    createChannelClient,
    registerClientListeners
} from './services/connection-manager.js';
import { startJanitor } from './services/janitor.js';
import type { ConnectionMap, HubContext } from './types.js';

dotenv.config();

// Global Error Handlers
process.on('uncaughtException', (err) => {
    console.error('🔥 [Hub] CRITICAL: Uncaught Exception:', err);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('🔥 [Hub] CRITICAL: Unhandled Rejection at:', promise, 'reason:', reason);
});

const app = express();
app.use(express.json());
app.use(cors());

const agentClient = new AgentProxy({
    url: process.env.AGENT_URL || '',
    headers: process.env.AGENT_TOKEN ? {
        'Authorization': `Bearer ${process.env.AGENT_TOKEN}`
    } : undefined
});

const gateway = new Gateway({ agentClient });
const connections: ConnectionMap = new Map();

const context: HubContext = {
    connections,
    gateway,
    agentClient
};

// Debug Logger Middleware
app.use((req, res, next) => {
    console.log(`📡 [Hub Incoming] ${req.method} ${req.url}`);
    next();
});

// Register Global Middlewares
agentClient.use(createLlmMiddleware(connections));
agentClient.use(createRateLimitMiddleware(connections));

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

        // Idempotency & Conflict Check
        for (const [existingId, conn] of connections.entries()) {
            if (channel === 'whatsapp') continue;
            if (conn.config.token === token && conn.config.channel === channel) {
                if (conn.config.userId === userId) {
                    return res.status(200).json({ id: existingId, channel, status: conn.status.type });
                }
                return res.status(409).json({ error: `This ${channel} bot token is already connected.` });
            }
        }

        const config = { id, channel, token, agentUrl: agentUrl || process.env.AGENT_URL, userId, metadata };
        const connectionObj = await startClient(config, context);

        await supabase.from('connections').upsert({
            id, platform: channel, token, user_id: userId,
            agent_url: config.agentUrl,
            // Don't persist transient states — WhatsApp status listener will update to 'active' on connect
            status: channel === 'whatsapp' ? 'pending' : 'active',
            metadata: config.metadata
        });

        res.status(201).json({ id, channel, status: connectionObj.status.type });
    } catch (error: any) {
        res.status(500).json({ error: error.message || 'Unknown error' });
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
                channel: conn.platform,
                userId: conn.user_id,
                status: activeConn ? activeConn.status.type : conn.status || 'inactive',
                metadata: conn.metadata,
                token: activeConn ? activeConn.config.token : conn.token,
                agentUrl: activeConn ? activeConn.config.agentUrl : conn.agent_url
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
    connection.lastPollAt = Date.now();
    res.json(connection.status);
});

app.post('/connections/:id/scan-qr', async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const connection = connections.get(id);
        if (!connection) return res.status(404).json({ error: 'Connection not found' });

        if (connection.client.channel === 'whatsapp' && 'deleteSession' in connection.client) {
            await (connection.client as any).deleteSession();
        }

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
        const { metadata, token, agentUrl: reqAgentUrl, agent_url } = req.body;
        const agentUrl = reqAgentUrl || agent_url;

        const connection = connections.get(id);
        if (!connection) return res.status(404).json({ error: 'Connection not found' });

        if (metadata) connection.config.metadata = { ...connection.config.metadata, ...metadata };
        if (agentUrl !== undefined) connection.config.agentUrl = agentUrl;
        if (token !== undefined && token.trim() !== "") connection.config.token = token;

        if ('updateConfiguration' in connection.client) {
            await (connection.client as any).updateConfiguration(metadata?.allowedContexts ? { allowedContexts: metadata.allowedContexts } : {});
        }

        if ((token !== undefined || agentUrl !== undefined) && connection.client.channel !== 'whatsapp') {
            await connection.client.stop();
            if (agentUrl !== undefined) {
                connection.agent = agentClient.createSession(connection.config.userId || connection.config.id, { agentUrl: connection.config.agentUrl });
            }
            const newClient = createChannelClient(connection.config);
            await gateway.removeConnection(id);
            connection.client = newClient;
            registerClientListeners(connection);
            await gateway.addConnection(newClient, connection.config);
            await newClient.start();
        }

        const updateData: any = {};
        if (metadata) updateData.metadata = connection.config.metadata;
        if (agentUrl !== undefined) updateData.agent_url = agentUrl;
        if (token !== undefined && token.trim() !== "") updateData.token = token;

        if (Object.keys(updateData).length > 0) {
            await supabase.from('connections').update(updateData).eq('id', id);
        }

        res.json({ status: 'updated', config: connection.config });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/connections/:id/contexts', async (req: Request, res: Response) => {
    try {
        const connection = connections.get(req.params.id);
        if (!connection) return res.status(404).json({ error: 'Connection not found' });
        res.json('getAvailableContexts' in connection.client ? await (connection.client as any).getAvailableContexts() : []);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

app.delete('/connections/:id', async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const connection = connections.get(id);
        if (!connection) return res.status(404).json({ error: 'Not found' });

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

// Start Janitor
startJanitor(connections);

// Start server
const PORT = Number(process.env.PORT) || 8081;
app.listen(PORT, '0.0.0.0', async () => {
    console.log(`🚀 Linkos Hub running on http://0.0.0.0:${PORT}`);
    await initializeConnections(context);
});
