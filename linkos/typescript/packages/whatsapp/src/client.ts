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

import type { PlatformClient, UnifiedMessage, Platform } from '@link-os/types';
import { normalizeWhatsAppTarget } from './normalize.js';

const VERSION = '0.1.0';

export interface AllowedContext {
    allowedJid: string; // The JID is stored here
    name: string;
    type: string;
    image?: string;
}

export interface WhatsAppClientOptions {
    sessionId: string;
    authDir?: string;
    allowedContexts?: AllowedContext[];
}

export class WhatsAppClient implements PlatformClient {
    readonly platform = 'whatsapp' as const;
    private sock: any = null;
    private options: WhatsAppClientOptions;
    private reconnecting = false;
    private logger = (pino as any).default ? (pino as any).default({ level: 'silent' }) : (pino as any)({ level: 'silent' });
    private messageHandler?: (message: UnifiedMessage) => Promise<void>;
    private statusHandler?: (status: { type: string; data?: any }) => void;
    private stopped = false;

    private allowedJids: string[] = [];

    constructor(options: WhatsAppClientOptions) {
        this.options = {
            authDir: options.authDir || `.auth/whatsapp/${options.sessionId}`,
            ...options
        };

        // Initialize allowedJids from allowedContexts
        if (options.allowedContexts && options.allowedContexts.length > 0) {
            this.allowedJids = options.allowedContexts
                .map(ctx => normalizeWhatsAppTarget(ctx.allowedJid))
                .filter((jid): jid is string => !!jid);
        } else {
            this.allowedJids = [];
        }
    }

    on(event: 'message' | 'status', handler: any): void {
        if (event === 'message') {
            this.messageHandler = handler;
        } else if (event === 'status') {
            this.statusHandler = handler;
        }
    }

    async start(): Promise<void> {
        this.stopped = false;
        const { state, saveCreds } = await useMultiFileAuthState(this.options.authDir!);
        const { version } = await fetchLatestBaileysVersion();

        console.log(`Using Baileys version: ${version.join('.')}`);
        if (this.allowedJids.length > 0) {
            console.log(`🔒 Allowlist enabled: ${this.allowedJids.length} IDs allowed.`);
        }

        this.sock = (makeWASocket as any).default ? (makeWASocket as any).default({
            auth: {
                creds: state.creds,
                keys: (makeCacheableSignalKeyStore as any)(state.keys, this.logger),
            },
            version,
            logger: this.logger,
            printQRInTerminal: false,
            browser: ['Ubuntu', 'Chrome', '20.0.04'],
            syncFullHistory: true, // Recommended for better desktop state emulation
            markOnlineOnConnect: false,
        }) : (makeWASocket as any)({
            auth: {
                creds: state.creds,
                keys: (makeCacheableSignalKeyStore as any)(state.keys, this.logger),
            },
            version,
            logger: this.logger,
            printQRInTerminal: false,
            browser: ['Ubuntu', 'Chrome', '20.0.04'],
            syncFullHistory: true,
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
                if (this.statusHandler) {
                    this.statusHandler({ type: 'qr', data: qr });
                }
            }

            if (connection === 'close') {
                const statusCode = (lastDisconnect?.error as Boom)?.output?.statusCode;
                const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

                console.log(`Connection closed. Status: ${statusCode}, Will reconnect: ${shouldReconnect}`);

                if (shouldReconnect && !this.reconnecting && !this.stopped) {
                    this.reconnecting = true;
                    console.log('Reconnecting in 5 seconds...');
                    setTimeout(() => {
                        this.reconnecting = false;
                        this.start();
                    }, 5000);
                }
            } else if (connection === 'open') {
                console.log('✅ Connected to WhatsApp');
                if (this.statusHandler) {
                    this.statusHandler({ type: 'connected' });
                }
            }
        });

        this.sock.ev.on('creds.update', saveCreds);

        this.sock.ev.on('messages.upsert', async ({ messages, type }: { messages: any[]; type: string }) => {
            if (type !== 'notify') return;

            for (const msg of messages) {
                if (msg.key.fromMe) continue;
                if (msg.key.remoteJid === 'status@broadcast') continue;

                const remoteJid = msg.key.remoteJid;
                const participant = msg.key.participant || remoteJid;
                const isGroup = remoteJid?.endsWith('@g.us') || false;

                // Allowlist Check
                if (this.allowedJids.length > 0) {
                    const isAllowed = this.allowedJids.some(allowed =>
                        remoteJid?.includes(allowed) || participant?.includes(allowed)
                    );

                    if (!isAllowed) {
                        // console.log(`🚫 Ignoring message from unauthorized source: ${remoteJid}`);
                        continue;
                    }
                }

                // Group Mention Policy: Only respond if tagged
                if (isGroup && this.sock?.user?.id) {
                    const botJid = normalizeWhatsAppTarget(this.sock.user.id);
                    const botLid = this.sock.user.lid ? normalizeWhatsAppTarget(this.sock.user.lid) : null;

                    const message = msg.message;
                    const contextInfo = message?.extendedTextMessage?.contextInfo ||
                        message?.imageMessage?.contextInfo ||
                        message?.videoMessage?.contextInfo ||
                        message?.documentMessage?.contextInfo ||
                        message?.audioMessage?.contextInfo ||
                        (message as any)?.contextInfo;

                    const mentions = contextInfo?.mentionedJid || [];

                    // Normalize all mentions and the bot ID for comparison
                    const isMentioned = mentions.some((m: string) => {
                        const normM = normalizeWhatsAppTarget(m);
                        const match = (botJid && normM === botJid) ||
                            (botLid && normM === botLid) ||
                            m === this.sock.user.id ||
                            (this.sock.user.lid && m === this.sock.user.lid);

                        return match;
                    });

                    // Check if it's a reply to the bot
                    const quotedParticipant = contextInfo?.participant;
                    const isReplyToBot = quotedParticipant && (
                        normalizeWhatsAppTarget(quotedParticipant) === botJid ||
                        normalizeWhatsAppTarget(quotedParticipant) === botLid ||
                        quotedParticipant === this.sock.user.id ||
                        (this.sock.user.lid && quotedParticipant === this.sock.user.lid)
                    );

                    if (!isMentioned && !isReplyToBot) {
                        continue;
                    }
                }

                const content = this.extractMessageContent(msg);
                if (!content) continue;

                if (!this.messageHandler) continue;

                const unifiedMessage: UnifiedMessage = {
                    id: msg.key.id || `wa_${Date.now()}`,
                    platform: 'whatsapp',
                    userId: remoteJid || '',
                    sessionId: this.options.sessionId,
                    content,
                    messageType: 'text',
                    timestamp: new Date((msg.messageTimestamp as number) * 1000),
                    metadata: {
                        pushName: msg.pushName || 'Unknown User',
                        isGroup,
                        participant: isGroup ? participant : undefined,
                        jid: remoteJid
                    }
                };

                // Typing indicator (optional, but keep for UX if stable)
                try {
                    // Only start typing if jid is valid
                    if (remoteJid) await this.startTyping(remoteJid);
                } catch (e) { /* ignore */ }

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

        const jid = normalizeWhatsAppTarget(to);
        if (!jid) {
            console.error(`[WhatsApp] Invalid message target: ${to}`);
            return;
        }

        await this.sock.sendMessage(jid, { text });
    }

    async startTyping(jid: string): Promise<void> {
        if (!this.sock) return;
        await this.sock.sendPresenceUpdate('composing', jid);
    }

    async stopTyping(jid: string): Promise<void> {
        if (!this.sock) return;
        await this.sock.sendPresenceUpdate('paused', jid);
    }

    async reactToMessage(jid: string, key: any, emoji: string): Promise<void> {
        if (!this.sock) return;
        await this.sock.sendMessage(jid, { react: { text: emoji, key } });
    }

    async markRead(jid: string, key: any): Promise<void> {
        if (!this.sock) return;
        await this.sock.readMessages([key]);
    }

    async updateConfiguration(config: Partial<WhatsAppClientOptions>): Promise<void> {
        if (config.allowedContexts) {
            this.allowedJids = config.allowedContexts
                .map(ctx => normalizeWhatsAppTarget(ctx.allowedJid))
                .filter((jid): jid is string => !!jid);
            console.log(`🔄 Configuration updated: Allowlist now has ${this.allowedJids.length} normalized IDs.`);
        }
    }

    async stop(): Promise<void> {
        this.stopped = true;
        if (this.sock) {
            this.sock.end(undefined);
            this.sock = null;
        }
    }

    async deleteSession(): Promise<void> {
        await this.stop();
        if (this.options.authDir) {
            const fs = await import('fs/promises');
            try {
                await fs.rm(this.options.authDir, { recursive: true, force: true });
                console.log(`Deleted session directory: ${this.options.authDir}`);
            } catch (error: any) {
                console.error(`Failed to delete session directory: ${error.message}`);
            }
        }
    }

    async getAvailableContexts(): Promise<{ id: string; name: string; type: 'group' | 'user'; image?: string }[]> {
        if (!this.sock) return [];

        const contexts: { id: string; name: string; type: 'group' | 'user'; image?: string }[] = [];

        try {
            // Fetch groups
            const groups = await this.sock.groupFetchAllParticipating();
            for (const [id, metadata] of Object.entries(groups)) {
                contexts.push({
                    id,
                    name: (metadata as any).subject || 'Unknown Group',
                    type: 'group'
                });
            }

            // Contacts fetching without store is not supported in minimalist mode
            // We rely on groups and manual entry for now to ensure stability
        } catch (error) {
            console.error('Failed to fetch contexts:', error);
        }

        // Deduplicate
        const unique = new Map();
        for (const ctx of contexts) {
            if (!unique.has(ctx.id)) {
                unique.set(ctx.id, ctx);
            }
        }

        const uniqueContexts = Array.from(unique.values());

        // Fetch Profile Pictures (best effort, parallel)
        await Promise.all(uniqueContexts.map(async (ctx) => {
            try {
                // 'preview' is faster/smaller, 'image' is full size
                ctx.image = await this.sock.profilePictureUrl(ctx.id, 'preview');
            } catch (e) {
                // Ignore error (no profile pic or privacy restricted)
                ctx.image = undefined;
            }
        }));

        return uniqueContexts;
    }
}
