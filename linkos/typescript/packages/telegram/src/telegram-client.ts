import { Telegraf, type Context } from 'telegraf';
import { v4 as uuidv4 } from 'uuid';
import type { PlatformClient, UnifiedMessage } from '@linkos/types';

export interface TelegramClientConfig {
    token: string;
    sessionIdPrefix?: string;
}

/**
 * Telegram client using Telegraf
 */
export class TelegramClient implements PlatformClient {
    readonly platform = 'telegram' as const;
    private bot: Telegraf;
    private messageHandler?: (message: UnifiedMessage) => Promise<void>;
    private statusHandler?: (status: { type: string; data?: any }) => void;
    private sessionIdPrefix: string;

    constructor(config: TelegramClientConfig) {
        this.bot = new Telegraf(config.token);
        this.sessionIdPrefix = config.sessionIdPrefix || 'tg';
        this.setupHandlers();
    }

    private setupHandlers() {
        // Handle text messages
        this.bot.on('text', async (ctx: Context) => {
            if (!this.messageHandler || !ctx.message || !('text' in ctx.message)) {
                return;
            }

            const userId = ctx.from?.id.toString();
            const chatId = ctx.chat?.id.toString();

            if (!userId || !chatId) {
                return;
            }

            const message: UnifiedMessage = {
                id: uuidv4(),
                platform: 'telegram',
                userId,
                sessionId: `${this.sessionIdPrefix}_${chatId}`,
                content: ctx.message.text,
                messageType: 'text',
                timestamp: new Date(ctx.message.date * 1000),
                metadata: {
                    chatId,
                    messageId: ctx.message.message_id,
                    username: ctx.from?.username
                }
            };

            await this.messageHandler(message);
        });
    }

    on(event: 'message' | 'status', handler: any): void {
        if (event === 'message') {
            this.messageHandler = handler;
        } else if (event === 'status') {
            this.statusHandler = handler;
        }
    }

    async start(): Promise<void> {
        console.log('🤖 Starting Telegram client...');
        // Launch in background without blocking
        this.bot.launch().then(() => {
            console.log('✅ Telegram client connected');
            if (this.statusHandler) {
                this.statusHandler({ type: 'connected' });
            }
        }).catch((err) => {
            console.error('❌ Failed to connect Telegram client:', err);
        });
    }

    async stop(): Promise<void> {
        console.log('🛑 Stopping Telegram client...');
        await this.bot.stop();
        console.log('✅ Telegram client stopped');
    }

    async sendMessage(userId: string, content: string): Promise<void> {
        try {
            await this.bot.telegram.sendMessage(userId, content);
        } catch (error) {
            console.error(`❌ Failed to send Telegram message to ${userId}:`, error);
            throw error;
        }
    }
}
