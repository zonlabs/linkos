
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { getHubConnectionContexts } from "@/lib/hub-api";

export async function GET(request: Request, props: { params: Promise<{ id: string }> }) {
    const params = await props.params;
    const { id } = params;

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const contexts = await getHubConnectionContexts(id);
        return NextResponse.json(contexts);
    } catch (error: any) {
        console.error("[Dashboard API] GET contexts error:", error.message);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
