import {
    Client,
    GatewayIntentBits,
    Events,
    type Message,
    type TextChannel,
    type DMChannel,
    type NewsChannel,
    type ThreadChannel,
    ChannelType,
} from 'discord.js';
import { v4 as uuidv4 } from 'uuid';
import type { ChannelClass, BaseMessage } from '@link-os/types';

export interface DiscordClientConfig {
    /** Discord bot token from the Developer Portal */
    token: string;
    /**
     * Optional prefix for session IDs.
     * Defaults to 'dc'.
     */
    sessionIdPrefix?: string;
    /**
     * If true, the bot responds to ALL messages in guild channels.
     * If false (default), the bot only responds when @mentioned or in DMs.
     */
    respondToAll?: boolean;
}

type SendableChannel = TextChannel | DMChannel | NewsChannel | ThreadChannel;

/**
 * Discord bot client implementing the Linkos ChannelClass interface.
 *
 * Setup:
 *  1. Create a bot at https://discord.com/developers/applications
 *  2. Enable the "MESSAGE CONTENT" privileged intent under Bot settings
 *  3. Invite the bot with scopes: bot + applications.commands
 *  4. Pass the Bot Token as `config.token`
 */
export class DiscordClient implements ChannelClass {
    readonly channel = 'discord' as const;

    private client: Client;
    private config: Required<DiscordClientConfig>;
    private messageHandler?: (message: BaseMessage) => Promise<void>;
    private statusHandler?: (status: { type: string; data?: unknown }) => void;

    constructor(config: DiscordClientConfig) {
        this.config = {
            sessionIdPrefix: 'dc',
            respondToAll: false,
            ...config,
        };

        this.client = new Client({
            intents: [
                GatewayIntentBits.Guilds,
                GatewayIntentBits.GuildMessages,
                GatewayIntentBits.MessageContent,
                GatewayIntentBits.DirectMessages,
            ],
        });

        this.setupHandlers();
    }

    // -------------------------------------------------------------------------
    // Private helpers
    // -------------------------------------------------------------------------

    private setupHandlers(): void {
        this.client.once(Events.ClientReady, (readyClient) => {
            console.log(`✅ Connected to Discord as ${readyClient.user.tag}`);
            this.statusHandler?.({ type: 'connected', data: { tag: readyClient.user.tag } });
        });

        this.client.on(Events.MessageCreate, async (message: Message) => {
            await this.handleIncomingMessage(message);
        });

        this.client.on(Events.Error, (error) => {
            console.error('[Discord] Client error:', error);
            this.statusHandler?.({ type: 'error', data: error });
        });
    }

    private async handleIncomingMessage(message: Message): Promise<void> {
        // Ignore messages from bots (including self)
        if (message.author.bot) return;
        if (!this.messageHandler) return;

        const isDM = message.channel.type === ChannelType.DM;
        const isMentioned = this.client.user
            ? message.mentions.has(this.client.user)
            : false;

        // In guild channels: only respond when mentioned (unless respondToAll is set)
        if (!isDM && !isMentioned && !this.config.respondToAll) return;

        // Strip the bot mention from the content so the agent gets clean text
        const content = this.client.user
            ? message.content.replace(`<@${this.client.user.id}>`, '').trim()
            : message.content.trim();

        if (!content) return;

        // Build a stable session ID:
        //   - Guild channel: "<prefix>_<guildId>_<channelId>"
        //   - DM:            "<prefix>_dm_<authorId>"
        const sessionId = isDM
            ? `${this.config.sessionIdPrefix}_dm_${message.author.id}`
            : `${this.config.sessionIdPrefix}_${message.guildId}_${message.channelId}`;

        const baseMessage: BaseMessage = {
            id: message.id || uuidv4(),
            channel: 'discord',
            // userId is the channel/DM ID so sendMessage() can reply to the right place
            userId: message.channelId,
            sessionId,
            content,
            messageType: 'text',
            timestamp: message.createdAt,
            metadata: {
                authorId: message.author.id,
                authorTag: message.author.tag,
                guildId: message.guildId ?? undefined,
                channelId: message.channelId,
                isDM,
            },
        };

        await this.messageHandler(baseMessage);
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
        console.log('🤖 Starting Discord client...');
        try {
            await this.client.login(this.config.token);
        } catch (error) {
            console.error('❌ Failed to connect Discord client:', error);
            this.statusHandler?.({ type: 'error', data: error });
            throw error;
        }
    }

    async stop(): Promise<void> {
        console.log('🛑 Stopping Discord client...');
        try {
            await this.client.destroy();
            console.log('✅ Discord client stopped');
            this.statusHandler?.({ type: 'disconnected' });
        } catch (error) {
            console.warn('⚠️ Discord client failed to stop gracefully:', error);
        }
    }

    /**
     * Send a text message to a Discord channel or DM by channel ID.
     * @param channelId The Discord channel ID (TextChannel, DMChannel, etc.)
     * @param content   The message text to send
     */
    async sendMessage(channelId: string, content: string): Promise<void> {
        try {
            const channel = await this.client.channels.fetch(channelId);
            if (!channel || !channel.isTextBased()) {
                throw new Error(`Channel ${channelId} is not a text-based channel`);
            }
            await (channel as SendableChannel).send(content);
        } catch (error) {
            console.error(`❌ Failed to send Discord message to channel ${channelId}:`, error);
            throw error;
        }
    }

    /**
     * Returns a list of text channels the bot has access to across all guilds.
     * Useful for the Hub's /connections/:id/contexts endpoint.
     */
    async getAvailableContexts(): Promise<{ id: string; name: string; type: 'group' | 'user' }[]> {
        const contexts: { id: string; name: string; type: 'group' | 'user' }[] = [];

        for (const guild of this.client.guilds.cache.values()) {
            try {
                const channels = await guild.channels.fetch();
                for (const channel of channels.values()) {
                    if (channel && channel.isTextBased() && channel.type === ChannelType.GuildText) {
                        contexts.push({
                            id: channel.id,
                            name: `${guild.name} / #${channel.name}`,
                            type: 'group',
                        });
                    }
                }
            } catch (error) {
                console.error(`[Discord] Failed to fetch channels for guild ${guild.id}:`, error);
            }
        }

        return contexts;
    }
}
