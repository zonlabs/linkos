import type { TelegramClient } from '@link-os/telegram';
import type { WhatsAppClient } from '@link-os/whatsapp';
import type { DiscordClient } from '@link-os/discord';
import type { SlackClient } from '@link-os/slack';
import type { ConnectionConfig } from '@link-os/types';
import type { AgentProxy, Gateway } from '@link-os/core';

export type HubClient = TelegramClient | WhatsAppClient | DiscordClient | SlackClient;

export interface ConnectionObject {
    client: HubClient;
    config: ConnectionConfig;
    status: { type: string; data?: any };
    lastPollAt: number;
    llmConfig?: any;
    agent: AgentProxy;
}

export type ConnectionMap = Map<string, ConnectionObject>;

export interface HubContext {
    connections: ConnectionMap;
    gateway: Gateway;
    agentClient: AgentProxy;
}
