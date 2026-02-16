
"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

import { X, Plus, Save, ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";

interface ContextItem {
    id: string; // Used locally
    name: string;
    type: string;
    image?: string;
}

interface ConnectionSettingsProps {
    connectionId: string;
    initialAllowedContexts?: any[]; // DB format: { allowedJid, name, type, image }
    onBack?: () => void;
}

export default function ConnectionSettings({ connectionId, initialAllowedContexts = [], onBack = () => { } }: ConnectionSettingsProps) {

    // Helper: Convert DB format (allowedJids array of objects) to Local format
    const mapDbToLocal = (dbList: any[]): ContextItem[] => {
        return dbList.map(item => ({
            id: item.allowedJid || item.id, // Handle new singular key or fallback
            name: item.name,
            type: item.type,
            image: item.image
        }));
    };

    const [allowedContexts, setAllowedContexts] = useState<ContextItem[]>(() => mapDbToLocal(initialAllowedContexts));
    const [newJid, setNewJid] = useState("");
    const [saving, setSaving] = useState(false);
    const router = useRouter();
    const [availableContexts, setAvailableContexts] = useState<ContextItem[]>([]);
    const [isLoadingContexts, setIsLoadingContexts] = useState(false);

    // Sync allowlist if props change
    useEffect(() => {
        setAllowedContexts(mapDbToLocal(initialAllowedContexts));
    }, [initialAllowedContexts]);

    // Fetch contexts only when connection changes
    useEffect(() => {
        fetchContexts();
    }, [connectionId]);

    const fetchContexts = async () => {
        setIsLoadingContexts(true);
        try {
            const res = await fetch(`/api/connections/${connectionId}/contexts`);
            if (res.ok) {
                const data = await res.json();
                setAvailableContexts(data);

                // Optional: Upgrade existing unknown contexts if we found better data
                setAllowedContexts(prev => prev.map(ctx => {
                    if (ctx.type === 'unknown') {
                        const found = data.find((d: ContextItem) => d.id === ctx.id);
                        return found || ctx;
                    }
                    return ctx;
                }));
            }
        } catch (e) {
            console.error("Failed to fetch contexts", e);
        } finally {
            setIsLoadingContexts(false);
        }
    };

    const handleAdd = () => {
        const jidToAdd = newJid.trim();
        if (!jidToAdd) return;
        if (allowedContexts.some(c => c.id === jidToAdd)) return;

        // Try to find rich data first
        const richContext = availableContexts.find(c => c.id === jidToAdd);
        const newContext = richContext || { id: jidToAdd, name: jidToAdd, type: 'user' };

        setAllowedContexts([...allowedContexts, newContext]);
        setNewJid("");
    };

    const handleAddContext = (ctx: ContextItem) => {
        if (allowedContexts.some(c => c.id === ctx.id)) return;
        setAllowedContexts([...allowedContexts, ctx]);
    };

    const handleRemove = (jid: string) => {
        setAllowedContexts(allowedContexts.filter(c => c.id !== jid));
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            // Map Local format (id) to DB format (allowedJid singular)
            const dbList = allowedContexts.map(c => ({
                allowedJid: c.id, // Singular key
                name: c.name,
                type: c.type,
                image: c.image
            }));

            const response = await fetch(`/api/connections/${connectionId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    metadata: {
                        allowedContexts: dbList
                    }
                })
            });

            if (!response.ok) throw new Error("Failed to save");
            toast.success("Settings saved successfully!");
            router.refresh();
        } catch (error) {
            console.error("Failed to save settings", error);
            toast.error("Failed to save settings");
        } finally {
            setSaving(false);
        }
    };

    const renderContextBadge = (ctx: ContextItem) => {
        const { id, name, type, image } = ctx;

        return (
            <div key={id} className="flex items-center justify-between p-2 rounded-lg bg-background border border-border shadow-sm group">
                <div className="flex items-center gap-3 overflow-hidden">
                    {image ? (
                        <img src={image} alt={name} className="w-8 h-8 rounded-full object-cover border border-muted" />
                    ) : (
                        <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center text-xs font-bold text-foreground">
                            {name.substring(0, 1).toUpperCase()}
                        </div>
                    )}
                    <div className="flex flex-col min-w-0">
                        <span className="text-sm font-semibold truncate text-foreground">{name}</span>
                        <div className="flex items-center gap-2">
                            <span className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground bg-muted px-1 rounded">{type}</span>
                            <span className="text-[9px] text-muted-foreground/40 font-mono truncate max-w-[120px]">{id}</span>
                        </div>
                    </div>
                </div>
                <Button variant="ghost" size="icon" onClick={() => handleRemove(id)} className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-full">
                    <X className="h-4 w-4" />
                </Button>
            </div>
        );
    };

    return (
        <div className="flex flex-col h-full bg-card rounded-xl border border-border shadow-sm overflow-hidden animate-in fade-in zoom-in-95 duration-300">
            <div className="p-6 overflow-y-auto">
                <div className="space-y-6">
                    <div className="flex items-center justify-between">
                        <div>
                            <h3 className="text-lg font-bold text-foreground">Access Control</h3>
                            <p className="text-sm text-muted-foreground">
                                Manage who can interact with this connection.
                            </p>
                        </div>
                    </div>

                    {/* Add New Input */}
                    <div className="flex gap-3">
                        <div className="relative flex-1">
                            <Input
                                placeholder="Enter Phone Number (e.g. 1234567890) or ID"
                                value={newJid}
                                onChange={(e) => setNewJid(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
                                className="h-12 bg-background border-input focus:border-primary transition-colors pr-10"
                            />
                        </div>
                        <Button onClick={handleAdd} size="icon" className="h-12 w-12 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 transition-all shadow-lg hover:shadow-xl"><Plus className="h-5 w-5" /></Button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {/* Left Column: Groups/Contacts (Available) */}
                        <div className="space-y-3">
                            <div className="flex items-center justify-between">
                                <span className="text-xs font-black uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                                    Groups/Contacts
                                    {isLoadingContexts && <span className="h-2 w-2 rounded-full bg-primary animate-pulse" />}
                                </span>
                                <button onClick={fetchContexts} className="text-[10px] text-primary hover:underline">
                                    Refresh
                                </button>
                            </div>

                            <div className="flex flex-col gap-2 p-4 bg-muted/30 rounded-xl border border-border/50 h-[300px] overflow-y-auto">
                                {isLoadingContexts ? (
                                    Array.from({ length: 5 }).map((_, i) => (
                                        <div key={i} className="h-10 w-full bg-muted-foreground/10 rounded-lg animate-pulse" />
                                    ))
                                ) : availableContexts.length > 0 ? (
                                    availableContexts.map(ctx => (
                                        <button
                                            key={ctx.id}
                                            onClick={() => handleAddContext(ctx)}
                                            className="flex items-center gap-3 p-2 text-left bg-card hover:bg-primary/5 rounded-lg border border-border/50 hover:border-primary/20 transition-all group w-full"
                                            title={ctx.id}
                                        >
                                            {ctx.image ? (
                                                <img src={ctx.image} alt={ctx.name} className="w-8 h-8 rounded-full object-cover bg-muted shrink-0" />
                                            ) : (
                                                <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary shrink-0">
                                                    {ctx.name.substring(0, 1).toUpperCase()}
                                                </div>
                                            )}
                                            <div className="flex flex-col flex-1 min-w-0">
                                                <span className="text-sm font-medium truncate text-foreground group-hover:text-primary transition-colors">{ctx.name}</span>
                                                <div className="flex items-center gap-2">
                                                    <span className="text-[10px] text-muted-foreground uppercase tracking-wider">{ctx.type}</span>
                                                    <span className="text-[9px] text-muted-foreground/50 truncate font-mono max-w-[100px]">{ctx.id}</span>
                                                </div>
                                            </div>
                                            <Plus className="h-4 w-4 text-muted-foreground group-hover:text-primary opacity-0 group-hover:opacity-100 transition-all" />
                                        </button>
                                    ))
                                ) : (
                                    <div className="flex items-center justify-center h-full text-center p-4">
                                        <span className="text-sm text-muted-foreground italic">No active groups or contacts detected yet.</span>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Right Column: Saved Allowlist */}
                        <div className="space-y-3">
                            <div className="flex items-center justify-between">
                                <span className="text-xs font-black uppercase tracking-widest text-muted-foreground">
                                    Allowlist
                                </span>
                                <span className="text-[10px] bg-muted px-2 py-0.5 rounded text-muted-foreground font-mono">
                                    {allowedContexts.length} Active
                                </span>
                            </div>

                            <div className="min-h-[300px] border border-dashed border-muted-foreground/20 rounded-xl p-4 bg-muted/10 transition-colors hover:bg-muted/20 flex flex-col gap-2">
                                {allowedContexts.length === 0 ? (
                                    <div className="h-full flex flex-col items-center justify-center text-center space-y-2 opacity-60 m-auto py-10">
                                        <span className="text-sm font-medium text-muted-foreground">No restrictions enabled</span>
                                        <span className="text-xs text-muted-foreground/60">The bot will respond to everyone.</span>
                                    </div>
                                ) : (
                                    <div className="space-y-2">
                                        {allowedContexts.map(ctx => renderContextBadge(ctx))}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    <div className="pt-2">
                        <p className="text-[10px] uppercase tracking-widest text-muted-foreground/60 font-bold mb-4">* Changes apply immediately to active connections</p>
                        <Button onClick={handleSave} disabled={saving} className="w-full md:w-auto md:min-w-[200px] h-12 rounded-full font-bold uppercase tracking-widest text-xs">
                            {saving ? "Saving Changes..." : "Save Configuration"}
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    );
}
