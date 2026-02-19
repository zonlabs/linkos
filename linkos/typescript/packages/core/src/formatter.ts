import type { Channel } from '@link-os/types';

/**
 * Formats Markdown content for a specific messaging channel.
 * Translates standard Markdown (headers, lists, etc.) into platform-native formatting.
 */
export function formatMessage(content: string, channel: Channel): string {
    if (!content) return content;

    switch (channel) {
        case 'whatsapp':
            return formatForWhatsApp(content);
        case 'telegram':
            return formatForTelegram(content);
        case 'slack':
            return formatForSlack(content);
        case 'discord':
            return formatForDiscord(content);
        default:
            return content;
    }
}

/**
 * WhatsApp Formatter
 * - Headers (### Header) -> *HEADER*
 * - Bold (**text**) -> *text*
 * - Standardize Italic (*text* or _text_) -> _text_
 * - Links ([text](url)) -> text (url)
 * - Lists (- item) -> • item
 */
function formatForWhatsApp(content: string): string {
    let text = content;

    // 1. Headers to Bold Caps
    text = text.replace(/^(#+)\s+(.+)$/gm, (match, hashes, title) => `*${title.toUpperCase()}*`);

    // 2. Bold: **text** -> *text*
    text = text.replace(/\*\*(.*?)\*\*/g, '*$1*');

    // 3. Italic standardize: *text* -> _text_
    text = text.replace(/(?<!\*)\*(?!\*)(.*?)(?<!\*)\*(?!\*)/g, '_$1_');

    // 4. Links: [text](url) -> text (url)
    text = text.replace(/\[(.*?)\]\((.*?)\)/g, '$1 ($2)');

    // 5. Bullet points: - item or * item -> • item
    text = text.replace(/^(\s*)[-*]\s+(.+)$/gm, '$1• $2');

    return text;
}

/**
 * Telegram Formatter
 * (Targeting standard Markdown V1 support)
 * - Headers -> BOLD CAPS
 * - Bullets -> •
 */
function formatForTelegram(content: string): string {
    let text = content;

    // 1. Headers to Bold Caps (Telegram doesn't support #)
    text = text.replace(/^(#+)\s+(.+)$/gm, (match, hashes, title) => `*${title.toUpperCase()}*`);

    // 2. Links: [text](url) -> text (url) if we are in non-parse mode, 
    // but Telegram supports [text](url) in Markdown. 
    // However, if we don't set parse_mode, it won't work.

    // 3. Bullets
    text = text.replace(/^(\s*)[-*]\s+(.+)$/gm, '$1• $2');

    return text;
}

/**
 * Slack Formatter
 * - Headers -> BOLD CAPS
 * - Bold: **text** -> *text*
 * - Italic: _text_ -> _text_ (Slack uses _ for italic)
 */
function formatForSlack(content: string): string {
    let text = content;

    // 1. Headers
    text = text.replace(/^(#+)\s+(.+)$/gm, (match, hashes, title) => `*${title.toUpperCase()}*`);

    // 2. Bold: **text** -> *text*
    text = text.replace(/\*\*(.*?)\*\*/g, '*$1*');

    return text;
}

/**
 * Discord Formatter
 * - Mostly passthrough as it has the best MD support
 * - Ensure headers are clean
 */
function formatForDiscord(content: string): string {
    // Discord handles modern Markdown (headers, etc) very well.
    // We'll keep it as-is for now to allow full rich formatting.
    return content;
}
