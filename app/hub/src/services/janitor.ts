import type { ConnectionMap } from '../types.js';

const JANITOR_INTERVAL = 10000; // 10s
const INACTIVITY_THRESHOLD = 30000; // 30s

/**
 * Starts the inactivity janitor background job
 */
export function startJanitor(connections: ConnectionMap) {
    console.log('🧹 [Hub Janitor] Inactivity janitor started.');

    const interval = setInterval(async () => {
        const now = Date.now();
        for (const [id, conn] of connections.entries()) {
            // Only targets WhatsApp QR sessions
            if (conn.config.channel === 'whatsapp' && (conn.status.type === 'qr' || conn.status.type === 'initializing')) {
                const idleTime = now - conn.lastPollAt;
                if (idleTime > INACTIVITY_THRESHOLD) {
                    console.log(`🧹 [Hub Janitor] Stopping inactive pending connection: ${id} (Idle for ${Math.round(idleTime / 1000)}s)`);
                    try {
                        await conn.client.stop();
                        conn.status = { type: 'stopped' };
                    } catch (err) {
                        console.error(`❌ [Hub Janitor] Failed to stop ${id}:`, err);
                    }
                }
            }
        }
    }, JANITOR_INTERVAL);

    return () => clearInterval(interval);
}
