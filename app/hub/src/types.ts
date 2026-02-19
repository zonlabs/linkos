import type { TelegramClient } from '@link-os/telegram';
import type { WhatsAppClient } from '@link-os/whatsapp';
import type { DiscordClient } from '@link-os/discord';
import type { SlackClient } from '@link-os/slack';
import type { ConnectionConfig } from '@link-os/types';
import type { AgentProxy, Gateway } from '@link-os/core';

export type HubClient = TelegramClient | WhatsAppClient | DiscordClient | SlackClient;

export interface ConnectionObject {
    /** The physical platform client (WhatsApp, Telegram, etc.) */
    client: HubClient;
    /** Connection settings from the database (token, agentUrl, etc.) */
    config: ConnectionConfig;
    /** Current library status (connected, stopped, initializing) */
    status: { type: string; data?: any };
    /** Last heartbeat/interaction timestamp (QR Code - WhatsAPP) */
    lastPollAt: number;
    /** LLM provider and API keys for the user (passed to the agent) */
    llmConfig?: any;
    /** The 'Master' agent instance used as a template for new sessions */
    agent: AgentProxy;
    /** Map of isolated conversation histories keyed by unique session IDs */
    sessionMap: Map<string, AgentProxy>;
}

export type ConnectionMap = Map<string, ConnectionObject>;

export interface HubContext {
    connections: ConnectionMap;
    gateway: Gateway;
    agentClient: AgentProxy;
}
