/**
 * Platform types
 */
export type Platform = 'telegram' | 'discord' | 'slack' | 'whatsapp';

/**
 * Message types
 */
export type MessageType = 'text' | 'image' | 'audio' | 'video' | 'file' | 'location' | 'contact' | 'sticker';

/**
 * Message context
 */
export interface MessageContext {
    replyTo?: string;
    threadId?: string;
    isEdited?: boolean;
    isForwarded?: boolean;
}

/**
 * Unified message format
 */
export interface UnifiedMessage {
    id: string;
    platform: Platform;
    userId: string;
    sessionId: string;
    content: string;
    messageType: MessageType;
    timestamp: Date;
    metadata?: Record<string, unknown>;
    context?: MessageContext;
}

/**
 * Connection configuration
 */
export interface ConnectionConfig {
    id: string;
    platform: Platform;
    token: string;
    agentUrl: string;
    userId?: string;
    metadata?: Record<string, unknown>;
}

/**
 * Agent response
 */
export interface AgentResponse {
    id: string;
    content: string;
    role: 'assistant' | 'user' | 'system';
    metadata?: Record<string, unknown>;
}

/**
 * Platform client interface
 */
export interface PlatformClient {
    platform: Platform;
    start(): Promise<void>;
    stop(): Promise<void>;
    sendMessage(userId: string, content: string): Promise<void>;
    on(event: 'message', handler: (message: UnifiedMessage) => Promise<void>): void;
}

/**
 * Agent client interface
 */
export interface AgentClient {
    sendMessage(message: UnifiedMessage): Promise<AgentResponse>;
}
