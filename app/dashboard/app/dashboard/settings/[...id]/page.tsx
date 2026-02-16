
import ConnectionSettings from "@/components/ConnectionSettings";

export default async function SettingsPage({ params }: { params: { id: string[] } }) {
    // Handling dynamic route parameter which might be an array or string depending on Next.js config
    const resolvedParams = await params;
    const id = Array.isArray(resolvedParams.id) ? resolvedParams.id[0] : resolvedParams.id;
    return <ConnectionSettings connectionId={id} />;
}
