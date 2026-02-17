/**
 * Channel types
 */
export type Channel = 'telegram' | 'discord' | 'slack' | 'whatsapp';

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
 * Base message format
 */
export interface BaseMessage {
    id: string;
    channel: Channel;
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
    channel: Channel;
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
 * Channel class interface
 */
export interface ChannelClass {
    channel: Channel;
    start(): Promise<void>;
    stop(): Promise<void>;
    sendMessage(userId: string, content: string): Promise<void>;
    on(event: 'message', handler: (message: BaseMessage) => Promise<void>): void;
    on(event: 'status', handler: (status: { type: string; data?: any }) => void): void;
}

/**
 * Agent client interface
 */
export interface AgentClient {
    sendMessage(message: BaseMessage): Promise<AgentResponse>;
}
