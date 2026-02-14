import { HttpAgent } from '@ag-ui/client';
import type { UnifiedMessage, AgentResponse } from '@linkos/types';

export interface AGUIClientConfig {
    url: string;
    headers?: Record<string, string>;
}

/**
 * AG-UI Client wrapper using official @ag-ui/client HttpAgent  
 * This eliminates message ID bugs by using the battle-tested protocol implementation
 */
export class AGUIClient {
    private url: string;
    private headers?: Record<string, string>;

    private agents: Map<string, HttpAgent> = new Map();

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

        // Get or create agent instance for this session (thread)
        let agent = this.agents.get(message.sessionId);
        if (!agent) {
            agent = new HttpAgent({
                url: this.url,
                headers: this.headers,
                threadId: message.sessionId
            });
            this.agents.set(message.sessionId, agent);
        }

        // Add the new user message to the agent's state
        // This ensures the agent maintains the full conversation history
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
