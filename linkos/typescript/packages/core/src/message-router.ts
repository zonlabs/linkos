import type { UnifiedMessage, PlatformClient, AgentResponse } from '@linkos/types';
import { AGUIClient } from './agui-client.js';

export interface MessageRouterConfig {
    agentUrl: string;
}

/**
 * Routes messages from platforms to the agent
 */
export class MessageRouter {
    private agentClient: AGUIClient;

    constructor(config: MessageRouterConfig) {
        this.agentClient = new AGUIClient({ url: config.agentUrl });
    }

    /**
     * Route a message to the agent and return response
     */
    async routeMessage(message: UnifiedMessage): Promise<AgentResponse> {
        console.log(`📤 Routing message from ${message.platform}: ${message.content.slice(0, 50)}...`);

        const response = await this.agentClient.sendMessage(message);

        console.log(`✅ Agent responded (${response.content.length} chars)`);
        return response;
    }
}
