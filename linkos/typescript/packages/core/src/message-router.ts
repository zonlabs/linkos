import type { UnifiedMessage, AgentResponse } from '@link-os/types';
import { AGUIClient } from './agui-client.js';

export interface MessageRouterConfig {
    agentUrl: string;
}

/**
 * Routes messages from platforms to the agent
 */
export class MessageRouter {
    private agentClient: AGUIClient;
    private runId: string;

    constructor(config: MessageRouterConfig) {
        this.agentClient = new AGUIClient({ url: config.agentUrl });
        // Generate a fresh Run ID for this process life to force fresh threads on restart
        this.runId = Math.random().toString(36).substring(2, 8);
        console.log(`🛠️ MessageRouter initialized with Run ID: ${this.runId}`);
    }

    /**
     * Route a message to the agent and return response
     */
    async routeMessage(message: UnifiedMessage): Promise<AgentResponse> {
        // We append the unique runId to the sessionId for every Hub execution.
        // This ensures the agent creates a brand-new conversation thread on every restart,
        // avoiding "unmatched history" errors from previous Hub sessions.
        const sessionId = `${message.sessionId}_${this.runId}`;

        console.log(`📤 Routing message from ${message.platform}: ${message.content.slice(0, 50)}...`);
        console.log(`🆔 Session: ${sessionId} (Original: ${message.sessionId})`);

        const response = await this.agentClient.sendMessage({
            ...message,
            sessionId: sessionId
        });

        console.log(`✅ Agent responded (${response.content.length} chars)`);
        return response;
    }
}
