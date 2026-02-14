import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { createHubConnection, deleteHubConnection, listHubConnections } from "@/lib/hub-api";

export async function GET() {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        // Fetch all connections directly from the Hub service
        const connections = await listHubConnections();
        return NextResponse.json(connections);
    } catch (error: any) {
        console.error("[Dashboard API] GET error:", error.message);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function POST(request: Request) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const body = await request.json();
        const { platform, token, agent_url } = body;

        // Generate a clean ID for the Hub
        const connectionId = `gw-${Math.random().toString(36).substr(2, 9)}`;

        // Trigger the Hub service directly
        const connection = await createHubConnection({
            connection_id: connectionId,
            platform,
            token,
            agent_url,
        });

        // The Hub now returns ConnectionMetadata, which we pass back to the UI
        return NextResponse.json({
            id: connectionId,
            platform,
            agent_url,
            status: "active",
            created_at: new Date().toISOString()
        });
    } catch (error: any) {
        console.error("[Dashboard API] POST error:", error.message);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function DELETE(request: Request) {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
        return NextResponse.json({ error: "Missing connection ID" }, { status: 400 });
    }

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        // Remove from Hub service
        await deleteHubConnection(id);
        return NextResponse.json({ success: true });
    } catch (error: any) {
        console.error("[Dashboard API] DELETE error:", error.message);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
