import type { ChannelClass, ConnectionConfig, BaseMessage } from '@link-os/types';
import { AgentProxy } from './agent-proxy.js';

export interface GatewayConfig {
    agentClient: AgentProxy;
}

/**
 * Gateway - Connection Manager
 * Tracks active platform connections and handles graceful shutdown.
 * Note: Message routing logic is handled by the Hub directly.
 */
export class Gateway {
    private clients: Map<string, ChannelClass> = new Map();

    constructor(config: GatewayConfig) {
        console.log(`✅ Gateway initialized with injected client`);
    }

    /**
     * Add a channel connection
     */
    async addConnection(client: ChannelClass, config: ConnectionConfig): Promise<void> {
        this.clients.set(config.id, client);
        console.log(`✅ Connection ${config.id} (${config.channel}) added to gateway`);
        // Note: Message routing is now handled by the Hub directly
    }

    /**
     * Remove a platform connection
     */
    async removeConnection(connectionId: string): Promise<void> {
        const client = this.clients.get(connectionId);
        if (client) {
            await client.stop();
            this.clients.delete(connectionId);
            console.log(`🛑 Connection ${connectionId} stopped`);
        }
    }

    /**
     * Stop all connections
     */
    async stop(): Promise<void> {
        const promises = Array.from(this.clients.entries()).map(async ([id, client]) => {
            try {
                await client.stop();
                console.log(`🛑 Stopped connection ${id}`);
            } catch (error) {
                console.error(`❌ Failed to stop connection ${id}:`, error);
            }
        });

        await Promise.all(promises);
        this.clients.clear();
    }
}
