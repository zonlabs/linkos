import LLMKeySettings from "@/components/LLMKeySettings";

export default function ApiKeysPage() {
  return (
    <main className="max-w-4xl mx-auto p-4 md:p-8 space-y-10">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500">Settings</p>
          <h1 className="text-2xl font-black tracking-tight uppercase text-gradient-premium">Gateway API Keys</h1>
        </div>
      </div>
      <LLMKeySettings />
    </main>
  );
}
