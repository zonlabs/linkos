export interface ConnectionRequest {
    connectionId: string;
    platform: string;
    token: string;
    agentUrl: string;
    userId?: string;
}

export async function createHubConnection(req: ConnectionRequest) {
    const HUB_API_URL = process.env.HUB_API_URL || "http://127.0.0.1:8081";

    const response = await fetch(`${HUB_API_URL}/connections`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify(req),
    });

    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || "Failed to create connection in Hub");
    }

    return response.json();
}

export async function deleteHubConnection(connection_id: string) {
    const HUB_API_URL = process.env.HUB_API_URL || "http://127.0.0.1:8081";

    const response = await fetch(`${HUB_API_URL}/connections/${connection_id}`, {
        method: "DELETE",
    });

    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || "Failed to delete connection in Hub");
    }

    return response.json();
}

export async function getHubConnectionStatus(connection_id: string) {
    const HUB_API_URL = process.env.HUB_API_URL || "http://127.0.0.1:8081";

    const response = await fetch(`${HUB_API_URL}/connections/${connection_id}/status`);

    if (!response.ok) {
        return { active: false };
    }

    return response.json();
}

export async function listHubConnections(userId: string) {
    const HUB_API_URL = process.env.HUB_API_URL || "http://127.0.0.1:8081";

    const url = `${HUB_API_URL}/connections?userId=${userId}`;
    console.log(`🔌 [Hub API] Fetching: ${url}`);
    const response = await fetch(url);

    if (!response.ok) {
        throw new Error("Failed to fetch connections from Hub");
    }

    return response.json();
}

export async function updateHubConnection(connectionId: string, metadata: any) {
    const HUB_API_URL = process.env.HUB_API_URL || "http://127.0.0.1:8081";

    const response = await fetch(`${HUB_API_URL}/connections/${connectionId}`, {
        method: "PATCH",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify({ metadata }),
    });

    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || "Failed to update connection in Hub");
    }

    return response.json();
}

export async function getHubConnectionContexts(connectionId: string) {
    const HUB_API_URL = process.env.HUB_API_URL || "http://127.0.0.1:8081";

    const response = await fetch(`${HUB_API_URL}/connections/${connectionId}/contexts`);

    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || "Failed to fetch contexts from Hub");
    }

    return response.json();
}
