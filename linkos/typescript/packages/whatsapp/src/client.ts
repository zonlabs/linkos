/* eslint-disable @typescript-eslint/no-explicit-any */
import makeWASocket, {
    DisconnectReason,
    useMultiFileAuthState,
    fetchLatestBaileysVersion,
    makeCacheableSignalKeyStore,
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import qrcode from 'qrcode-terminal';
import pino from 'pino';

import type { PlatformClient, UnifiedMessage, Platform } from '@linkos/types';

const VERSION = '0.1.0';

export interface WhatsAppClientOptions {
    sessionId: string;
    authDir?: string;
}

export class WhatsAppClient implements PlatformClient {
    readonly platform = 'whatsapp' as const;
    private sock: any = null;
    private options: WhatsAppClientOptions;
    private reconnecting = false;
    private logger = (pino as any).default ? (pino as any).default({ level: 'silent' }) : (pino as any)({ level: 'silent' });
    private messageHandler?: (message: UnifiedMessage) => Promise<void>;

    constructor(options: WhatsAppClientOptions) {
        this.options = {
            authDir: options.authDir || `.auth/whatsapp/${options.sessionId}`,
            ...options
        };
    }

    on(event: 'message', handler: (message: UnifiedMessage) => Promise<void>): void {
        if (event === 'message') {
            this.messageHandler = handler;
        }
    }

    async start(): Promise<void> {
        const { state, saveCreds } = await useMultiFileAuthState(this.options.authDir!);
        const { version } = await fetchLatestBaileysVersion();

        console.log(`Using Baileys version: ${version.join('.')}`);

        this.sock = (makeWASocket as any).default ? (makeWASocket as any).default({
            auth: {
                creds: state.creds,
                keys: (makeCacheableSignalKeyStore as any)(state.keys, this.logger),
            },
            version,
            logger: this.logger,
            printQRInTerminal: false,
            browser: ['linkos', 'cli', VERSION],
            syncFullHistory: false,
            markOnlineOnConnect: false,
        }) : (makeWASocket as any)({
            auth: {
                creds: state.creds,
                keys: (makeCacheableSignalKeyStore as any)(state.keys, this.logger),
            },
            version,
            logger: this.logger,
            printQRInTerminal: false,
            browser: ['linkos', 'cli', VERSION],
            syncFullHistory: false,
            markOnlineOnConnect: false,
        });

        if (this.sock.ws && typeof this.sock.ws.on === 'function') {
            this.sock.ws.on('error', (err: Error) => {
                console.error('WebSocket error:', err.message);
            });
        }

        this.sock.ev.on('connection.update', async (update: any) => {
            const { connection, lastDisconnect, qr } = update;

            if (qr) {
                console.log('\n📱 Scan this QR code with WhatsApp (Linked Devices):\n');
                qrcode.generate(qr, { small: true });
            }

            if (connection === 'close') {
                const statusCode = (lastDisconnect?.error as Boom)?.output?.statusCode;
                const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

                console.log(`Connection closed. Status: ${statusCode}, Will reconnect: ${shouldReconnect}`);

                if (shouldReconnect && !this.reconnecting) {
                    this.reconnecting = true;
                    console.log('Reconnecting in 5 seconds...');
                    setTimeout(() => {
                        this.reconnecting = false;
                        this.start();
                    }, 5000);
                }
            } else if (connection === 'open') {
                console.log('✅ Connected to WhatsApp');
            }
        });

        this.sock.ev.on('creds.update', saveCreds);

        this.sock.ev.on('messages.upsert', async ({ messages, type }: { messages: any[]; type: string }) => {
            if (type !== 'notify') return;

            for (const msg of messages) {
                if (msg.key.fromMe) continue;
                if (msg.key.remoteJid === 'status@broadcast') continue;

                const content = this.extractMessageContent(msg);
                if (!content) continue;

                if (!this.messageHandler) continue;

                const isGroup = msg.key.remoteJid?.endsWith('@g.us') || false;

                const unifiedMessage: UnifiedMessage = {
                    id: msg.key.id || `wa_${Date.now()}`,
                    platform: 'whatsapp',
                    userId: msg.key.remoteJid?.replace('@s.whatsapp.net', '') || '',
                    sessionId: this.options.sessionId,
                    content,
                    messageType: 'text',
                    timestamp: new Date((msg.messageTimestamp as number) * 1000),
                    metadata: {
                        pushName: msg.pushName,
                        jid: msg.key.remoteJid,
                        isGroup
                    }
                };

                await this.messageHandler(unifiedMessage);
            }
        });
    }

    private extractMessageContent(msg: any): string | null {
        const message = msg.message;
        if (!message) return null;

        if (message.conversation) return message.conversation;
        if (message.extendedTextMessage?.text) return message.extendedTextMessage.text;
        if (message.imageMessage?.caption) return `[Image] ${message.imageMessage.caption}`;
        if (message.videoMessage?.caption) return `[Video] ${message.videoMessage.caption}`;
        if (message.documentMessage?.caption) return `[Document] ${message.documentMessage.caption}`;
        if (message.audioMessage) return `[Voice Message]`;

        return null;
    }

    async sendMessage(to: string, text: string): Promise<void> {
        if (!this.sock) throw new Error('Not connected');
        const jid = to.includes('@') ? to : `${to}@s.whatsapp.net`;
        await this.sock.sendMessage(jid, { text });
    }

    async stop(): Promise<void> {
        if (this.sock) {
            this.sock.end(undefined);
            this.sock = null;
        }
    }
}
