import ConnectionSettings from "@/components/ConnectionSettings";

export default function SettingsPage({ params }: { params: { id: string[] } }) {
  const id = params.id[0];

  return <ConnectionSettings connectionId={id} />;
}
