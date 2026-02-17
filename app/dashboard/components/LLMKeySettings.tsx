"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Key, Save, Eye, EyeOff, Shield, Sparkles, ChevronDown, Check, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const LLM_PROVIDERS = [
    { id: 'openai', label: 'OpenAI', placeholder: 'sk-...', description: 'For GPT-4o, GPT-3.5-Turbo' },
    { id: 'gemini', label: 'Google', placeholder: 'AIza...', description: 'For Gemini 1.5 Pro/Flash' },
    { id: 'anthropic', label: 'Anthropic', placeholder: 'sk-ant-...', description: 'For anthropic 3.5 Sonnet/Opus' },
    { id: 'grok', label: 'Grok', placeholder: 'xai-...', description: 'For Grok-1' },
    { id: 'deepseek', label: 'DeepSeek', placeholder: 'sk-...', description: 'For DeepSeek-V3' },
];

export default function LLMKeySettings() {
    const supabase = createClient();
    const [keys, setKeys] = useState<Record<string, string>>({
        openai: "",
        google: "",
        anthropic: "",
        grok: "",
        deepseek: ""
    });
    const [selectedProvider, setSelectedProvider] = useState(LLM_PROVIDERS[0]);
    const [activeProviderId, setActiveProviderId] = useState<string | null>(null);
    const [showKey, setShowKey] = useState(false);
    const [saving, setSaving] = useState(false);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        async function fetchSettings() {
            try {
                const { data: { user } } = await supabase.auth.getUser();
                if (!user) return;

                const { data: settings } = await supabase
                    .from("user_settings")
                    .select("llm_keys, active_provider")
                    .eq("user_id", user.id)
                    .maybeSingle();

                if (settings) {
                    if (settings.llm_keys) setKeys(settings.llm_keys);
                    if (settings.active_provider) setActiveProviderId(settings.active_provider);
                }
            } catch (e) {
                console.error("Failed to fetch settings", e);
            } finally {
                setLoading(false);
            }
        }
        fetchSettings();
    }, []);

    const handleSave = async () => {
        setSaving(true);
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) {
                toast.error("User not authenticated");
                return;
            }

            const { error } = await supabase
                .from("user_settings")
                .upsert({
                    user_id: user.id,
                    llm_keys: keys,
                    active_provider: selectedProvider.id
                }, { onConflict: 'user_id' });

            if (error) throw error;

            setActiveProviderId(selectedProvider.id);
            toast.success(`${selectedProvider.label} API Key activated!`);
        } catch (e: any) {
            console.error("Save failed", e);
            toast.error(`Save failed: ${e.message}`);
        } finally {
            setSaving(false);
        }
    };

    const handleKeyChange = (value: string) => {
        setKeys(prev => ({ ...prev, [selectedProvider.id]: value }));
    };

    if (loading) {
        return (
            <div className="flex items-center gap-2 text-zinc-500 animate-pulse py-12">
                <Sparkles className="h-4 w-4 animate-spin" />
                <span className="text-xs font-bold uppercase tracking-widest">Loading Settings...</span>
            </div>
        );
    }

    return (
        <div className="space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-700 max-w-2xl py-6">
            <div className="space-y-2">
                <h3 className="text-2xl font-black tracking-tighter text-zinc-900 dark:text-white flex items-center gap-3">
                    <Key className="h-6 w-6 text-primary" /> LLM API Key
                </h3>
                <p className="text-zinc-500 text-[10px] font-black uppercase tracking-widest italic opacity-70">
                    Your global keys are stored securely and synced across all your active gateways.
                </p>
            </div>

            <div className="space-y-8 flex flex-col items-start justify-start">
                <div className="w-full space-y-6">
                    <div className="flex flex-col gap-2">
                        <label className="text-[10px] font-black uppercase tracking-widest text-zinc-500 flex items-center gap-2">
                            Select Provider <ChevronDown className="h-3 w-3 opacity-50" />
                        </label>
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button variant="outline" className="h-14 w-full md:w-80 justify-between rounded-2xl border-zinc-200 dark:border-white/5 bg-zinc-50 dark:bg-white/5 px-6 text-lg font-black tracking-tighter hover:bg-zinc-100 dark:hover:bg-white/10 transition-all group relative overflow-hidden">
                                    <span className="flex items-center gap-3">
                                        {selectedProvider.label}
                                        {activeProviderId === selectedProvider.id && (
                                            <span className="text-[8px] font-black bg-primary/10 text-primary px-2 py-0.5 rounded-full uppercase tracking-widest border border-primary/20">Active</span>
                                        )}
                                    </span>
                                    <ChevronDown className="h-4 w-4 text-zinc-400 group-hover:text-primary transition-colors" />
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="start" className="w-56 rounded-2xl p-2 border-zinc-100 dark:border-white/10 shadow-2xl bg-white dark:bg-zinc-900">
                                {LLM_PROVIDERS.map((p) => (
                                    <DropdownMenuItem
                                        key={p.id}
                                        onClick={() => setSelectedProvider(p)}
                                        className="flex items-center justify-between py-3 px-4 rounded-xl cursor-pointer hover:bg-zinc-100 dark:hover:bg-white/5 transition-colors group"
                                    >
                                        <div className="flex items-center gap-3">
                                            <span className="font-bold text-[10px] uppercase tracking-widest text-zinc-600 dark:text-zinc-400 group-hover:text-primary">{p.label}</span>
                                            {activeProviderId === p.id && (
                                                <div className="h-1.5 w-1.5 rounded-full bg-primary shadow-[0_0_5px_rgba(var(--primary),0.5)]" />
                                            )}
                                        </div>
                                        {selectedProvider.id === p.id && <Check className="h-3.5 w-3.5 text-primary" />}
                                    </DropdownMenuItem>
                                ))}
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </div>

                    <div className="space-y-4 max-w-xl">
                        <div className="flex items-center justify-between px-1">
                            <label className="text-[10px] font-black uppercase tracking-widest text-zinc-500">
                                {selectedProvider.label} Secret Key
                            </label>
                        </div>
                        <div className="relative group">
                            <Input
                                type={showKey ? "text" : "password"}
                                placeholder={selectedProvider.placeholder}
                                value={keys[selectedProvider.id] || ""}
                                onChange={(e) => handleKeyChange(e.target.value)}
                                className="bg-white dark:bg-black/40 border-zinc-200/60 dark:border-white/10 focus:border-primary/50 h-16 rounded-2xl px-6 pr-14 text-sm font-mono tracking-wider shadow-sm transition-all focus:ring-0"
                            />
                            <div className="absolute inset-y-0 right-3 flex items-center gap-2">
                                <button
                                    onClick={() => setShowKey(!showKey)}
                                    className="p-2 rounded-xl hover:bg-zinc-100 dark:hover:bg-white/5 text-zinc-400 hover:text-primary transition-all active:scale-95"
                                    title={showKey ? "Hide key" : "Show key"}
                                >
                                    {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                </button>
                                {keys[selectedProvider.id] && (
                                    <div className="h-2 w-2 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.5)] animate-pulse mr-2" />
                                )}
                            </div>
                        </div>
                        <div className="flex items-start gap-2 px-1">
                            <Sparkles className="h-3 w-3 text-primary mt-0.5 opacity-50" />
                            <p className="text-[10px] text-zinc-500 font-medium italic">
                                {selectedProvider.description}
                            </p>
                        </div>
                    </div>

                    <Button
                        onClick={handleSave}
                        disabled={saving}
                        className="h-16 w-full md:w-80 rounded-2xl font-black text-[11px] uppercase tracking-[0.25em] bg-zinc-900 hover:bg-zinc-800 text-white dark:bg-white dark:text-black dark:hover:bg-zinc-200 transition-all flex items-center justify-center gap-3 shadow-xl active:scale-[0.98]"
                    >
                        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                        Activate {selectedProvider.label} Key
                    </Button>
                </div>
            </div>
        </div>
    );
}
