import express, { type Request, type Response } from 'express';
import { Gateway } from '@linkos/core';
import { TelegramClient } from '@linkos/telegram';
import { WhatsAppClient } from '@linkos/whatsapp';
import type { ConnectionConfig } from '@linkos/types';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
app.use(express.json());

const gateway = new Gateway({
    agentUrl: process.env.AGENT_URL || 'http://127.0.0.1:8001/agent'
});

// Store active connections
const connections = new Map<string, { client: TelegramClient | WhatsAppClient; config: ConnectionConfig }>();

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
        const { platform, token, user_id } = req.body;

        if (!platform || !token) {
            res.status(400).json({ error: 'Missing platform or token' });
            return;
        }

        if (platform !== 'telegram' && platform !== 'whatsapp') {
            res.status(400).json({ error: 'Unsupported platform. Supported: telegram, whatsapp' });
            return;
        }

        const connectionId = `${platform}_${Date.now()}`;
        const config: ConnectionConfig = {
            id: connectionId,
            platform,
            token,
            agentUrl: process.env.AGENT_URL || 'http://127.0.0.1:8001/agent',
            userId: user_id
        };

        // Create appropriate client
        let client;
        if (platform === 'telegram') {
            client = new TelegramClient({ token });
        } else {
            client = new WhatsAppClient({
                sessionId: user_id || `session_${Date.now()}`
            });
        }

        // Add to gateway
        await gateway.addConnection(client, config);

        // Store connection
        connections.set(connectionId, { client, config });

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
 * List all connections
 */
app.get('/connections', (req: Request, res: Response) => {
    const conns = Array.from(connections.values()).map(({ config }) => ({
        id: config.id,
        platform: config.platform,
        userId: config.userId
    }));
    res.json(conns);
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

        res.json({ status: 'deleted' });
    } catch (error) {
        console.error('Error deleting connection:', error);
        res.status(500).json({
            error: error instanceof Error ? error.message : 'Unknown error'
        });
    }
});

// Start server
const PORT = process.env.PORT || 8081;
app.listen(PORT, () => {
    console.log(`🚀 Linkos Hub (TypeScript) running on port ${PORT}`);
    console.log(`📡 Agent URL: ${process.env.AGENT_URL || 'http://127.0.0.1:8001/agent'}`);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
    console.log('Received SIGTERM, shutting down gracefully...');
    await gateway.stop();
    process.exit(0);
});
