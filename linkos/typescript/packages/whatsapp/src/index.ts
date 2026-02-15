/* eslint-disable @typescript-eslint/no-explicit-any */
import { WebSocketServer, WebSocket } from 'ws';
import { WhatsAppClient, InboundMessage } from './client';

const PORT = 6001;
const AUTH_DIR = 'auth_info_baileys';

// Bridge Logic connecting WhatsAppClient to linkos agent
class WhatsAppBridge {
    private client: WhatsAppClient;
    private wss: WebSocketServer;

    constructor() {
        this.wss = new WebSocketServer({ port: PORT });

        this.client = new WhatsAppClient({
            authDir: AUTH_DIR,
            onMessage: (msg) => this.broadcastToAgent(msg),
            onQR: () => { },
            onStatus: (status) => console.log(`Bridge status: ${status}`),
        });

        this.setupAgentServer();
    }

    private setupAgentServer() {
        this.wss.on('connection', (ws) => {
            console.log('🔌 Python agent connected');

            ws.on('message', async (data) => {
                try {
                    const msg = JSON.parse(data.toString());
                    if (msg.type === 'send') {
                        await this.client.sendMessage(msg.to, msg.content);
                    }
                } catch (err) {
                    console.error('Error processing agent message:', err);
                }
            });
        });
        console.log(`Bridge server listening on port ${PORT}`);
    }

    private broadcastToAgent(msg: InboundMessage) {
        const payload = JSON.stringify({
            type: 'message',
            id: msg.id,
            from: msg.sender,
            name: msg.name,
            content: msg.content,
            isGroup: msg.isGroup
        });

        this.wss.clients.forEach((ws) => {
            if (ws.readyState === WebSocket.OPEN) {
                ws.send(payload);
            }
        });
    }

    async start() {
        await this.client.connect();
    }
}

const bridge = new WhatsAppBridge();
bridge.start().catch(console.error);
