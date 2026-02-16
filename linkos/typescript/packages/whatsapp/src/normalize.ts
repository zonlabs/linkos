
/**
 * WhatsApp JID Normalization following OpenClaw/Baileys patterns.
 */

const WHATSAPP_USER_JID_RE = /^(\d+)(?::\d+)?@s\.whatsapp\.net$/i;
const WHATSAPP_LID_RE = /^(\d+)(?::\d+)?@lid$/i;

/**
 * Clean phone numbers to digits only.
 */
export function normalizeE164(value: string): string {
    return value.replace(/\D/g, "");
}

function stripWhatsAppTargetPrefixes(value: string): string {
    let candidate = value.trim();
    for (; ;) {
        const before = candidate;
        candidate = candidate.replace(/^whatsapp:/i, "").trim();
        if (candidate === before) {
            return candidate;
        }
    }
}

/**
 * Check if the JID belongs to a group.
 */
export function isWhatsAppGroupJid(value: string): boolean {
    const candidate = stripWhatsAppTargetPrefixes(value);
    const lower = candidate.toLowerCase();
    return lower.endsWith("@g.us");
}

/**
 * Normalize input string into a valid Baileys JID.
 * Handles phone numbers, group IDs, and existing JIDs with device suffixes.
 */
export function normalizeWhatsAppTarget(value: string): string | null {
    const candidate = stripWhatsAppTargetPrefixes(value);
    if (!candidate) return null;

    // Handle Groups
    if (isWhatsAppGroupJid(candidate)) {
        const localPart = candidate.slice(0, candidate.length - "@g.us".length);
        return `${localPart}@g.us`;
    }

    // Handle standard user JIDs (strip device suffixes like :5)
    if (WHATSAPP_USER_JID_RE.test(candidate)) {
        const match = candidate.match(WHATSAPP_USER_JID_RE);
        return `${match![1]}@s.whatsapp.net`;
    }

    // Handle LIDs
    if (WHATSAPP_LID_RE.test(candidate)) {
        const match = candidate.match(WHATSAPP_LID_RE);
        return `${match![1]}@lid`;
    }

    // Handle raw phone numbers or strings without @
    if (!candidate.includes("@")) {
        const normalized = normalizeE164(candidate);
        // Only accept if it has at least 5 digits (sanity check for phone numbers)
        return normalized.length >= 5 ? `${normalized}@s.whatsapp.net` : null;
    }

    return null;
}
