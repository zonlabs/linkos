
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { updateHubConnection, deleteHubConnection } from "@/lib/hub-api";

export async function PATCH(request: Request, props: { params: Promise<{ id: string }> }) {
    const params = await props.params;
    const { id } = params;

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const body = await request.json();
        const { metadata, token, agentUrl } = body;

        const result = await updateHubConnection(id, metadata, token, agentUrl);
        return NextResponse.json(result);
    } catch (error: any) {
        console.error("[Dashboard API] PATCH error:", error.message);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function DELETE(_request: Request, props: { params: Promise<{ id: string }> }) {
    const params = await props.params;
    const { id } = params;

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        await deleteHubConnection(id);
        return NextResponse.json({ success: true });
    } catch (error: any) {
        console.error("[Dashboard API] DELETE error:", error.message);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
