import bolt from '@slack/bolt';
const { App, LogLevel } = bolt;
import type { AppOptions, App as AppType } from '@slack/bolt';
import { v4 as uuidv4 } from 'uuid';
import type { ChannelClass, BaseMessage } from '@link-os/types';

export interface SlackClientConfig {
    /** Slack Bot Token (xoxb-...) */
    token: string;
    /** Slack Signing Secret */
    signingSecret: string;
    /**
     * App-Level Token (xapp-...) for Socket Mode.
     * Required for Socket Mode (no public webhook URL needed).
     */
    appToken: string;
    /**
     * Optional prefix for session IDs.
     * Defaults to 'sl'.
     */
    sessionIdPrefix?: string;
}

/**
 * Slack bot client implementing the Linkos ChannelClass interface.
 *
 * Uses Bolt for JavaScript in Socket Mode — no public webhook URL required.
 *
 * Setup:
 *  1. Create a Slack App at https://api.slack.com/apps
 *  2. Enable Socket Mode (Settings > Socket Mode)
 *  3. Generate an App-Level Token with `connections:write` scope
 *  4. Add Bot Token Scopes: app_mentions:read, channels:history, chat:write,
 *     im:history, im:write, groups:history
 *  5. Subscribe to bot events: app_mention, message.im
 *  6. Install the app to your workspace
 *  7. Pass Bot Token, Signing Secret, and App-Level Token to this config
 */
export class SlackClient implements ChannelClass {
    readonly channel = 'slack' as const;

    private app: AppType;
    private config: Required<SlackClientConfig>;
    private messageHandler?: (message: BaseMessage) => Promise<void>;
    private statusHandler?: (status: { type: string; data?: unknown }) => void;

    constructor(config: SlackClientConfig) {
        this.config = {
            sessionIdPrefix: 'sl',
            ...config,
        };

        const appOptions: AppOptions = {
            token: this.config.token,
            signingSecret: this.config.signingSecret,
            socketMode: true,
            appToken: this.config.appToken,
            // Suppress the default Bolt logger noise in production
            logger: {
                debug: () => { },
                info: () => { },
                warn: (msg) => console.warn('[Slack Bolt]', msg),
                error: (msg) => console.error('[Slack Bolt]', msg),
                setLevel: () => { },
                getLevel: () => LogLevel.WARN,
                setName: () => { },
            },
        };

        this.app = new App(appOptions);
        this.setupHandlers();
    }

    // -------------------------------------------------------------------------
    // Private helpers
    // -------------------------------------------------------------------------

    private setupHandlers(): void {
        // Respond to @mentions in public/private channels
        this.app.event('app_mention', async ({ event, say }: { event: any, say: any }) => {
            if (!this.messageHandler) return;

            // Strip the bot mention tag from the text
            const content = event.text.replace(/<@[A-Z0-9]+>/g, '').trim();
            if (!content) return;

            const sessionId = `${this.config.sessionIdPrefix}_${event.team ?? 'unknown'}_${event.channel}`;

            const baseMessage: BaseMessage = {
                id: event.ts || uuidv4(),
                channel: 'slack',
                // userId is the channel ID so sendMessage() replies to the right place
                userId: event.channel,
                sessionId,
                content,
                messageType: 'text',
                timestamp: new Date(parseFloat(event.ts) * 1000),
                metadata: {
                    authorId: event.user,
                    teamId: event.team ?? undefined,
                    channelId: event.channel,
                    threadTs: (event as any).thread_ts ?? undefined,
                    isDM: false,
                },
            };

            // Acknowledge immediately (Slack requires a response within 3 seconds)
            await say({ text: '⏳ Processing...' });
            await this.messageHandler(baseMessage);
        });

        // Respond to direct messages
        this.app.message(async ({ message, say }: { message: any, say: any }) => {
            if (!this.messageHandler) return;

            // Only handle DMs (channel_type === 'im')
            const msg = message as any;
            if (msg.channel_type !== 'im') return;
            if (msg.bot_id || msg.subtype) return; // ignore bot messages and subtypes

            const content = (msg.text || '').trim();
            if (!content) return;

            const sessionId = `${this.config.sessionIdPrefix}_dm_${msg.user}`;

            const baseMessage: BaseMessage = {
                id: msg.ts || uuidv4(),
                channel: 'slack',
                userId: msg.channel,
                sessionId,
                content,
                messageType: 'text',
                timestamp: new Date(parseFloat(msg.ts) * 1000),
                metadata: {
                    authorId: msg.user,
                    channelId: msg.channel,
                    isDM: true,
                },
            };

            await say({ text: '⏳ Processing...' });
            await this.messageHandler(baseMessage);
        });
    }

    // -------------------------------------------------------------------------
    // ChannelClass interface
    // -------------------------------------------------------------------------

    on(event: 'message', handler: (message: BaseMessage) => Promise<void>): void;
    on(event: 'status', handler: (status: { type: string; data?: unknown }) => void): void;
    on(event: 'message' | 'status', handler: unknown): void {
        if (event === 'message') {
            this.messageHandler = handler as (message: BaseMessage) => Promise<void>;
        } else if (event === 'status') {
            this.statusHandler = handler as (status: { type: string; data?: unknown }) => void;
        }
    }

    async start(): Promise<void> {
        console.log('🤖 Starting Slack client (Socket Mode)...');
        try {
            await this.app.start();
            console.log('✅ Connected to Slack via Socket Mode');
            this.statusHandler?.({ type: 'active' });
        } catch (error) {
            console.error('❌ Failed to connect Slack client:', error);
            this.statusHandler?.({ type: 'error', data: error });
            throw error;
        }
    }

    async stop(): Promise<void> {
        console.log('🛑 Stopping Slack client...');
        try {
            await this.app.stop();
            console.log('✅ Slack client stopped');
            this.statusHandler?.({ type: 'disconnected' });
        } catch (error) {
            console.warn('⚠️ Slack client failed to stop gracefully:', error);
        }
    }

    /**
     * Send a text message to a Slack channel or DM by channel ID.
     * @param channelId The Slack channel ID (e.g. C01234ABCDE or D01234ABCDE for DMs)
     * @param content   The message text to send (supports Slack mrkdwn)
     */
    async sendMessage(channelId: string, content: string): Promise<void> {
        try {
            await this.app.client.chat.postMessage({
                channel: channelId,
                text: content,
            });
        } catch (error) {
            console.error(`❌ Failed to send Slack message to channel ${channelId}:`, error);
            throw error;
        }
    }
}
