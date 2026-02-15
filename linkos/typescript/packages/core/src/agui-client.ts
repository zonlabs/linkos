import { HttpAgent } from '@ag-ui/client';
import type { UnifiedMessage, AgentResponse } from '@link-os/types';

export interface AGUIClientConfig {
    url: string;
    headers?: Record<string, string>;
}

/**
 * AG-UI Client wrapper using official @ag-ui/client HttpAgent  
 * Refactored to be stateless: every request creates a transient agent instance.
 * This ensures compatibility with serverless environments and avoids sync issues.
 */
export class AGUIClient {
    private url: string;
    private headers?: Record<string, string>;
    private historyMap: Map<string, any[]> = new Map();

    constructor(config: AGUIClientConfig) {
        this.url = config.url;
        this.headers = config.headers;
    }

    /**
     * Send a message to the agent using official HttpAgent
     * Uses the subscriber pattern for event handling
     */
    async sendMessage(message: UnifiedMessage): Promise<AgentResponse> {
        let fullContent = '';
        let assistantMessageId: string | undefined;

        // Initialize transient agent instance for this specific request
        const agent = new HttpAgent({
            url: this.url,
            headers: this.headers,
            threadId: message.sessionId
        });

        // Rehydrate history from internal cache if available
        const existingHistory = this.historyMap.get(message.sessionId);
        if (existingHistory && existingHistory.length > 0) {
            console.log(`[AGUI] 📸 Rehydrating ${existingHistory.length} messages from snapshot cache`);
            agent.addMessages(existingHistory);
        }

        // Add the new user message to the agent's state for the current run
        agent.addMessage({
            id: message.id,
            role: 'user',
            content: message.content
        });

        try {
            // Run agent with subscriber to capture events
            const result = await agent.runAgent(
                {
                    runId: `run_${Date.now()}`,
                    tools: [],
                    context: []
                },
                {
                    onMessagesSnapshotEvent: (params) => {
                        console.log(`\n📸 [AGUI] Updating snapshot cache (${params.event.messages.length} messages) for session ${message.sessionId}`);
                        this.historyMap.set(message.sessionId, params.event.messages);
                    },
                    onTextMessageStartEvent: (params) => {
                        console.log('🔹 Event: Text Message Start');
                        assistantMessageId = params.event.messageId;
                    },
                    onTextMessageContentEvent: (params: any) => {
                        if (params.textMessageBuffer) {
                            fullContent = params.textMessageBuffer;
                        } else if (params.event.content) {
                            fullContent += params.event.content;
                        } else if (params.event.delta) {
                            fullContent += params.event.delta;
                        }
                    },
                    onTextMessageEndEvent: (params) => {
                        console.log('\n🔹 Event: Text Message End');
                        if (!assistantMessageId && params.event.messageId) {
                            assistantMessageId = params.event.messageId;
                        }
                    }
                }
            );

            return {
                id: assistantMessageId || `msg_${Date.now()}`,
                content: fullContent,
                role: 'assistant',
                metadata: {
                    result: result.result,
                    newMessages: result.newMessages
                }
            };
        } catch (error) {
            console.error('AG-UI client error:', error);
            throw error;
        }
    }
}
