import type { PlatformClient, ConnectionConfig } from '@link-os/types';
import { MessageRouter } from './message-router.js';

export interface GatewayConfig {
    agentUrl: string;
}

/**
 * Main Gateway class that manages platform connections
 */
export class Gateway {
    private clients: Map<string, PlatformClient> = new Map();
    private router: MessageRouter;

    constructor(config: GatewayConfig) {
        this.router = new MessageRouter({ agentUrl: config.agentUrl });
        console.log(`✅ Gateway initialized with agent: ${config.agentUrl}`);
    }

    /**
     * Add a platform connection
     */
    async addConnection(client: PlatformClient, config: ConnectionConfig, agentMiddlewares?: Array<(input: any, next: any) => any>): Promise<void> {
        // Set up message handler
        client.on('message', async (message) => {
            try {
                // Pass provided middlewares to the router
                const response = await this.router.routeMessage(message, agentMiddlewares);

                if (response.content && response.content.trim().length > 0) {
                    await client.sendMessage(message.userId, response.content);
                } else {
                    console.warn('⚠️ Agent returned empty content');
                }
            } catch (error) {
                console.error(`❌ Error routing message:`, error);
                try {
                    await client.sendMessage(
                        message.userId,
                        `Sorry, I encountered an error: ${error instanceof Error ? error.message : 'Unknown error'}`
                    );
                } catch (sendError) {
                    console.error('❌ Failed to send error message to user:', sendError);
                }
            }
        });

        this.clients.set(config.id, client);
        console.log(`✅ Connection ${config.id} (${config.platform}) added to gateway`);
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
        for (const [id, client] of this.clients) {
            await client.stop();
            console.log(`🛑 Stopped connection ${id}`);
        }
        this.clients.clear();
    }
}
