import { Gateway } from '@linkos/core';
import type { PlatformClient, ConnectionConfig } from '@linkos/types';
import { TelegramClient } from '@linkos/telegram';

// Global declaration to prevent multiple instances in dev mode
declare global {
  var _gateway: Gateway | undefined;
}

const AGENT_URL = process.env.AGENT_URL || 'http://localhost:8001/agent';

function getGateway() {
  if (global._gateway) return global._gateway;

  const gateway = new Gateway({ agentUrl: AGENT_URL });
  global._gateway = gateway;
  return gateway;
}

export const gateway = getGateway();

// Store for active connections config (in-memory for now, ideally DB)
// This mirrors what we had in the separate Hub service
export const connectionStore = new Map<string, ConnectionConfig>();

export async function addConnection(platform: string, token: string, userId?: string) {
  if (platform !== 'telegram') {
    throw new Error('Only telegram is supported');
  }

  const connectionId = `${platform}_${Date.now()}`;
  const config: ConnectionConfig = {
    id: connectionId,
    platform,
    token,
    agentUrl: AGENT_URL,
    userId
  };

  const client = new TelegramClient({ token });
  
  // Start client and add to gateway
  // client.start() is already non-blocking
  await gateway.addConnection(client, config);
  
  connectionStore.set(connectionId, config);
  
  return {
    id: connectionId,
    platform,
    status: 'active'
  };
}

export async function removeConnection(id: string) {
  const config = connectionStore.get(id);
  if (!config) throw new Error('Connection not found');
  
  await gateway.removeConnection(id);
  connectionStore.delete(id);
}

export function listConnections() {
  return Array.from(connectionStore.values()).map(c => ({
    id: c.id,
    platform: c.platform,
    userId: c.userId
  }));
}
