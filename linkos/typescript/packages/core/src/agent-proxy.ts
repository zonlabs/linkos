import { HttpAgent, type HttpAgentConfig, type RunAgentResult } from '@ag-ui/client';
import type { BaseMessage, AgentResponse } from '@link-os/types';

/**
 * AgentProxy Configuration
 * Extends the base HttpAgentConfig to allow for future custom options.
 */
export interface AgentProxyConfig extends HttpAgentConfig {
    // Add custom configuration properties here if needed in the future
}

/**
 * AgentProxy - A protocol-native agent wrapper.
 * Extends the official HttpAgent to provide state, tools, and history management.
 * Acts as a proxy to the remote agent service.
 */
export class AgentProxy extends HttpAgent {
    constructor(config: AgentProxyConfig) {
        super(config);
    }

    /**
     * Send a message to the agent using the native runAgent() pattern.
     * Returns a Promise for compatibility with existing platform bridges.
     */
    async sendMessage(message: BaseMessage): Promise<AgentResponse> {
        // 1. Add user message to history natively
        this.addMessage({
            id: message.id,
            role: 'user',
            content: message.content
        } as any);

        // 2. Use the native runAgent API which handles the full lifecycle
        const runResult: RunAgentResult = await this.runAgent({
            runId: `run_${Date.now()}`
        });

        // 3. Find the assistant's response in newMessages
        const assistantMsg = runResult.newMessages.find(m => m.role === 'assistant');

        if (!assistantMsg || !assistantMsg.content) {
            console.warn(`[AgentProxy:${this.threadId}] ⚠️ No assistant response received. New messages:`, runResult.newMessages.length);
            throw new Error('The agent failed to produce a response. This might be due to missing configuration or an internal error.');
        }

        return {
            id: assistantMsg.id,
            content: assistantMsg.content,
            role: 'assistant'
        };
    }

    /**
     * Create a session-specific clone of this agent.
     * This allows the Hub to maintain isolated histories per user/session.
     * @param threadId - Unique session ID
     * @param config - Optional configuration overrides (URL, headers, initialState, etc.)
     */
    createSession(threadId: string, config?: { agentUrl?: string; headers?: Record<string, string>; initialState?: Record<string, any> }): AgentProxy {
        const clone = (this.clone() as unknown) as AgentProxy;
        clone.threadId = threadId;

        if (config?.agentUrl) {
            clone.url = config.agentUrl;
        }

        if (config?.headers) {
            clone.headers = { ...clone.headers, ...config.headers };
        }

        if (config?.initialState) {
            clone.state = { ...clone.state, ...config.initialState };
        }

        return clone;
    }


    /**
     * Preparation hook: Called before any runAgent() call to construct the input payload.
     * We override this to ensure that state (like llm_config) is consistently merged.
     */
    protected override prepareRunAgentInput(parameters?: any): any {
        const input = super.prepareRunAgentInput(parameters);

        // Ensure state from the class instance is merged into the run input
        if (this.state) {
            input.state = { ...input.state, ...this.state };
        }

        console.log(`[AgentProxy:${this.threadId}] 📤 Preparing run input with ${input.messages?.length || 0} messages and state keys: ${Object.keys(input.state || {}).join(',')}`);

        return input;
    }
}
