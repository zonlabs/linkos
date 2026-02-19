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

import type { ChannelClass, BaseMessage, Channel } from '@link-os/types';
import { normalizeWhatsAppTarget, compareJids } from './normalize.js';

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

export class WhatsAppClient implements ChannelClass {
    readonly channel = 'whatsapp' as const;
    private sock: any = null;
    private options: WhatsAppClientOptions;
    private reconnecting = false;
    private logger = (pino as any).default ? (pino as any).default({ level: 'info' }) : (pino as any)({ level: 'info' });
    private messageHandler?: (message: BaseMessage) => Promise<void>;
    private statusHandler?: (status: { type: string; data?: any }) => void;
    private stopped = false;
    private isStarting = false;
    private reconnectAttempts = 0;
    private maxReconnectAttempts = 10;
    private resetTimeout: NodeJS.Timeout | null = null;
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
        if (this.isStarting) {
            return;
        }
        this.isStarting = true;
        this.stopped = false;

        // Clear any pending reset
        if (this.resetTimeout) {
            clearTimeout(this.resetTimeout);
            this.resetTimeout = null;
        }

        try {
            // console.log(`[WhatsAppClient] Initializing auth state for ${this.options.sessionId}...`);
            const { state, saveCreds } = await useMultiFileAuthState(this.options.authDir!);

            // console.log(`[WhatsAppClient] Fetching latest Baileys version...`);
            let version: [number, number, number];
            try {
                const { version: fetchedVersion, isLatest } = await fetchLatestBaileysVersion();
                version = fetchedVersion;
                // console.log(`[WhatsAppClient] Using Baileys version: ${version.join('.')} (latest: ${isLatest})`);
            } catch (vErr) {
                console.warn('[WhatsAppClient] Failed to fetch latest version, using fallback:', vErr);
                version = [2, 3000, 1015901307];
            }

            // console.log(`🔒 Allowlist enabled: ${this.allowedJids.length} IDs allowed.`);

            const isDefaultImport = !!(makeWASocket as any).default;
            const sockOptions = {
                auth: {
                    creds: state.creds,
                    keys: makeCacheableSignalKeyStore(state.keys, this.logger as any),
                },
                version,
                logger: this.logger as any,
                printQRInTerminal: false,
                browser: ['Linux', 'Chrome', '130.0.6723.70'] as [string, string, string],
                syncFullHistory: false,
                shouldSyncHistoryMessage: () => false,
                markOnlineOnConnect: false, // DON'T mark online on EC2 to avoid initial sync flags
                connectTimeoutMs: 120000,
                defaultQueryTimeoutMs: 120000,
                keepAliveIntervalMs: 60000,
                generateHighQualityLinkPreview: false,
                getMessage: async () => {
                    return { conversation: 'historical message placeholder' };
                }
            };

            this.sock = isDefaultImport ? (makeWASocket as any).default(sockOptions) : makeWASocket(sockOptions);

            if (this.sock.ws && typeof this.sock.ws.on === 'function') {
                this.sock.ws.on('error', (err: Error) => {
                    console.error('WebSocket error:', err.message);
                });
            }

            // Global event processing
            this.sock.ev.process(async (events: any) => {
                if (events['connection.update']) {
                    const update = events['connection.update'];
                    const { connection, lastDisconnect, qr } = update;

                    if (qr) {
                        console.log('\n📱 Scan this QR code with WhatsApp (Linked Devices):\n');
                        qrcode.generate(qr, { small: true });
                        if (this.statusHandler) {
                            this.statusHandler({ type: 'qr', data: qr });
                        }
                    }

                    if (lastDisconnect?.error) {
                        const statusCode = (lastDisconnect.error as Boom)?.output?.statusCode;
                        if (statusCode !== 515) {
                            console.log(`[WhatsApp] Connection Error Trace (Status: ${statusCode}):`);
                            console.dir(lastDisconnect.error, { depth: 1 });
                        }

                        if (statusCode === 515) {
                            console.warn('⚠️ 515 Stream Error detected. Attempting instant restart to maintain pairing continuity...');
                            // No session delete here - we want the next socket to resume
                        }
                    }

                    if (connection === 'close') {
                        const statusCode = (lastDisconnect?.error as Boom)?.output?.statusCode;
                        const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

                        console.log(`[WhatsApp] Connection closed. Status: ${statusCode}, Reason: ${lastDisconnect?.error?.message}, Will reconnect: ${shouldReconnect}`);

                        this.isStarting = false; // Reset starting flag so we can retry

                        if (this.resetTimeout) {
                            clearTimeout(this.resetTimeout);
                            this.resetTimeout = null;
                        }

                        if (shouldReconnect && !this.reconnecting && !this.stopped) {
                            if (this.reconnectAttempts < this.maxReconnectAttempts) {
                                this.reconnectAttempts++;
                                this.reconnecting = true;

                                // Aggressive restart (500ms) for 515 errors
                                const reconnectDelay = statusCode === 515 ? 500 : 5000;

                                if (this.statusHandler) {
                                    this.statusHandler({ type: 'reconnecting', data: { attempt: this.reconnectAttempts, max: this.maxReconnectAttempts } });
                                }

                                console.log(`Reconnecting (Attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts}) in ${reconnectDelay}ms...`);
                                setTimeout(() => {
                                    this.reconnecting = false;
                                    this.start();
                                }, reconnectDelay);
                            } else {
                                console.error(`[WhatsApp] Max reconnection attempts (${this.maxReconnectAttempts}) reached. Stopping.`);
                                if (this.statusHandler) {
                                    this.statusHandler({ type: 'disconnected', data: { reason: 'max_retries' } });
                                }
                                this.stop();
                            }
                        } else if (this.statusHandler && !shouldReconnect) {
                            this.statusHandler({ type: 'disconnected' });
                        }
                    } else if (connection === 'open') {
                        console.log('✅ Connected to WhatsApp');
                        this.isStarting = false;

                        if (this.resetTimeout) clearTimeout(this.resetTimeout);
                        this.resetTimeout = setTimeout(() => {
                            this.reconnectAttempts = 0;
                            this.resetTimeout = null;
                        }, 10000);

                        if (this.statusHandler) {
                            this.statusHandler({ type: 'connected' });
                        }
                    }
                }

                if (events['creds.update']) {
                    await saveCreds();
                }

                if (events['messages.upsert']) {
                    const { messages, type } = events['messages.upsert'];
                    if (type === 'notify') {
                        for (const msg of messages) {
                            await this.handleIncomingMessage(msg);
                        }
                    }
                }
            });

        } catch (error) {
            this.isStarting = false;
            console.error('[WhatsApp] Failed to start:', error);
            if (this.statusHandler) {
                this.statusHandler({ type: 'error', data: error });
            }
        }
    }

    private async handleIncomingMessage(msg: any): Promise<void> {
        if (msg.key.fromMe) return;
        if (msg.key.remoteJid === 'status@broadcast') return;

        const remoteJid = msg.key.remoteJid;
        const participant = msg.key.participant || remoteJid;
        const isGroup = remoteJid?.endsWith('@g.us') || false;

        // PN fallback: Baileys often provides phone numbers in Alt fields when LIDs are used
        const remoteJidAlt = (msg.key as any).remoteJidAlt;
        const participantAlt = (msg.key as any).participantAlt;
        const senderPn = (msg as any).senderPn;

        // Allowlist Check
        if (this.allowedJids.length > 0) {
            const normalizedRemote = remoteJid ? normalizeWhatsAppTarget(remoteJid) : null;
            const normalizedParticipant = participant ? normalizeWhatsAppTarget(participant) : null;
            const normalizedRemoteAlt = remoteJidAlt ? normalizeWhatsAppTarget(remoteJidAlt) : null;
            const normalizedParticipantAlt = participantAlt ? normalizeWhatsAppTarget(participantAlt) : null;
            const normalizedSenderPn = senderPn ? normalizeWhatsAppTarget(senderPn) : null;

            const isAllowed = this.allowedJids.some(allowed =>
                compareJids(normalizedRemote, allowed) ||
                compareJids(normalizedParticipant, allowed) ||
                compareJids(normalizedRemoteAlt, allowed) ||
                compareJids(normalizedParticipantAlt, allowed) ||
                compareJids(normalizedSenderPn, allowed)
            );

            if (!isAllowed) return;
        }

        // Group Mention Policy
        if (isGroup && this.sock?.user?.id) {
            const botJid = normalizeWhatsAppTarget(this.sock.user.id);
            const botLid = this.sock.user.lid ? normalizeWhatsAppTarget(this.sock.user.lid) : null;

            const message = msg.message;
            const contextInfo = (message as any)?.extendedTextMessage?.contextInfo ||
                (message as any)?.imageMessage?.contextInfo ||
                (message as any)?.videoMessage?.contextInfo ||
                (message as any)?.documentMessage?.contextInfo ||
                (message as any)?.audioMessage?.contextInfo ||
                (message as any)?.contextInfo;

            const mentions = contextInfo?.mentionedJid || [];

            const isMentioned = mentions.some((m: string) => {
                const normM = normalizeWhatsAppTarget(m);
                return (botJid && normM === botJid) ||
                    (botLid && normM === botLid) ||
                    m === this.sock.user.id ||
                    (this.sock.user.lid && m === this.sock.user.lid);
            });

            const quotedParticipant = contextInfo?.participant;
            const isReplyToBot = quotedParticipant && (
                normalizeWhatsAppTarget(quotedParticipant) === botJid ||
                normalizeWhatsAppTarget(quotedParticipant) === botLid ||
                quotedParticipant === this.sock.user.id ||
                (this.sock.user.lid && quotedParticipant === this.sock.user.lid)
            );

            if (!isMentioned && !isReplyToBot) return;
        }

        const content = this.extractMessageContent(msg);
        if (!content || !this.messageHandler) return;

        const baseMessage: BaseMessage = {
            id: msg.key.id || `wa_${Date.now()}`,
            channel: 'whatsapp',
            userId: remoteJid || '',
            sessionId: `${this.options.sessionId}_${remoteJid}`,
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

        try {
            if (remoteJid) await this.startTyping(remoteJid);
        } catch (e) { /* ignore */ }

        await this.messageHandler(baseMessage);
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
            console.log(`[WhatsApp] 🔄 Updating allowlist with ${config.allowedContexts.length} contexts...`);
            this.allowedJids = config.allowedContexts
                .map(ctx => {
                    const norm = normalizeWhatsAppTarget(ctx.allowedJid);
                    console.log(`  - ${ctx.allowedJid} -> ${norm}`);
                    return norm;
                })
                .filter((jid): jid is string => !!jid);
            console.log(`🔄 Configuration updated: Allowlist now has ${this.allowedJids.length} normalized IDs.`);
        }
    }

    async stop(): Promise<void> {
        this.stopped = true;
        this.isStarting = false;
        if (this.resetTimeout) {
            clearTimeout(this.resetTimeout);
            this.resetTimeout = null;
        }
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
            const groups = await this.sock.groupFetchAllParticipating();
            for (const [id, metadata] of Object.entries(groups)) {
                contexts.push({
                    id,
                    name: (metadata as any).subject || 'Unknown Group',
                    type: 'group'
                });
            }
        } catch (error) {
            console.error('Failed to fetch contexts:', error);
        }

        await Promise.all(contexts.map(async (ctx) => {
            try {
                ctx.image = await this.sock.profilePictureUrl(ctx.id, 'preview');
            } catch (e) {
                ctx.image = undefined;
            }
        }));

        return contexts;
    }
}
