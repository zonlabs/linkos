
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { updateHubConnection } from "@/lib/hub-api";

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
        const { metadata } = body;

        // Verify ownership (optional but recommended)
        // const { data: conn } = await supabase.from('connections').select('user_id').eq('id', id).single();
        // if (conn?.user_id !== user.id) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

        const result = await updateHubConnection(id, metadata);
        return NextResponse.json(result);
    } catch (error: any) {
        console.error("[Dashboard API] PATCH error:", error.message);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
