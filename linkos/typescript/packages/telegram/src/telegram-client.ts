import { Telegraf, type Context } from 'telegraf';
import { v4 as uuidv4 } from 'uuid';
import type { ChannelClass, BaseMessage } from '@link-os/types';

export interface TelegramClientConfig {
    token: string;
    sessionIdPrefix?: string;
}

/**
 * Telegram client using Telegraf
 */
export class TelegramClient implements ChannelClass {
    readonly channel = 'telegram' as const;
    private bot: Telegraf;
    private messageHandler?: (message: BaseMessage) => Promise<void>;
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

            const message: BaseMessage = {
                id: uuidv4(),
                channel: 'telegram',
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

        // launch() resolves on shutdown, not on connect — run it in the background
        this.bot.launch().then(() => {
            console.log('🛑 Telegram polling stopped');
        }).catch((err) => {
            console.error('❌ Failed to connect Telegram client:', err);
            if (this.statusHandler) {
                this.statusHandler({ type: 'error', data: err });
            }
        });

        // getMe() confirms the bot is authenticated and reachable
        try {
            const me = await this.bot.telegram.getMe();
            console.log(`✅ Connected to Telegram as @${me.username}`);
            if (this.statusHandler) {
                this.statusHandler({ type: 'active' });
            }
        } catch (err) {
            console.error('❌ Telegram connection verification failed:', err);
        }
    }

    async stop(): Promise<void> {
        console.log('🛑 Stopping Telegram client...');
        try {
            await this.bot.stop();
            console.log('✅ Telegram client stopped');
        } catch (error) {
            console.warn('⚠️ Telegram client was already stopped or failed to stop:', error instanceof Error ? error.message : error);
        }
    }

    async sendMessage(userId: string, content: string): Promise<void> {
        try {
            await this.bot.telegram.sendMessage(userId, content, { parse_mode: 'Markdown' });
        } catch (error) {
            console.error(`❌ Failed to send Telegram message to ${userId}:`, error);
            throw error;
        }
    }
}
