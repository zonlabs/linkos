
"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

import { X, Plus, Save, ArrowLeft, QrCode, RefreshCw, Shield, AlertCircle, Eye, EyeOff } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { QRCodeSVG } from "qrcode.react";

interface ContextItem {
    id: string; // Used locally
    name: string;
    type: string;
    image?: string;
}

interface ConnectionSettingsProps {
    connectionId: string;
    channel?: string;
    status?: string;
    initialAllowedContexts?: any[]; // DB format: { allowedJid, name, type, image }
    initialMetadata?: any;
    initialToken?: string;
    initialAgentUrl?: string;
    onBack?: () => void;
    onDelete?: (id: string) => void;
}

export default function ConnectionSettings({
    connectionId,
    channel,
    status,
    initialAllowedContexts = [],
    initialMetadata = {},
    initialToken = "",
    initialAgentUrl = "",
    onBack = () => { },
    onDelete = () => { }
}: ConnectionSettingsProps) {

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
    const [token, setToken] = useState(initialToken);
    const [agentUrl, setAgentUrl] = useState(initialAgentUrl);
    const [signingSecret, setSigningSecret] = useState(initialMetadata?.signingSecret || "");
    const [appToken, setAppToken] = useState(initialMetadata?.appToken || "");
    const [showToken, setShowToken] = useState(false);
    const [showSigningSecret, setShowSigningSecret] = useState(false);
    const [showAppToken, setShowAppToken] = useState(false);
    const [saving, setSaving] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);
    const router = useRouter();
    const [availableContexts, setAvailableContexts] = useState<ContextItem[]>([]);
    const [isLoadingContexts, setIsLoadingContexts] = useState(false);

    // Rescan states
    const [isRescanning, setIsRescanning] = useState(false);
    const [currentQR, setCurrentQR] = useState<string | null>(null);
    const [connStatus, setConnStatus] = useState<string>(status || "initializing");
    const [pendingConnId, setPendingConnId] = useState<string | null>(null);

    // Sync allowlist if props change
    useEffect(() => {
        setAllowedContexts(mapDbToLocal(initialAllowedContexts));
    }, [initialAllowedContexts]);

    // Update connStatus if status prop changes
    useEffect(() => {
        if (status) setConnStatus(status);
    }, [status]);

    // Polling logic for QR
    useEffect(() => {
        if (!pendingConnId) return;

        let pollInterval: NodeJS.Timeout;

        const checkStatus = async () => {
            try {
                const res = await fetch(`/api/connections/${pendingConnId}/status`);
                if (res.ok) {
                    const data = await res.json();
                    if (data.type === 'qr' && data.data) {
                        setCurrentQR(data.data);
                        setConnStatus('qr');
                    }
                    if (data.type === 'connected' || data.status === 'connected') {
                        setConnStatus('connected');
                        setTimeout(() => {
                            setPendingConnId(null);
                            setIsRescanning(false);
                            toast.success("Connection re-established!");
                            router.refresh();
                        }, 2000);
                    }
                }
            } catch (err) {
                console.error("Poll failed", err);
            }
        };

        checkStatus();
        pollInterval = setInterval(checkStatus, 2000);
        // Only clear the interval — Hub janitor handles connection cleanup
        return () => clearInterval(pollInterval);
    }, [pendingConnId]);

    const handleRescan = async () => {
        setIsRescanning(true);
        setConnStatus("initializing");
        setCurrentQR(null);
        setPendingConnId(connectionId);
        try {
            const res = await fetch(`/api/connections/${connectionId}/scan-qr`, { method: "POST" });
            if (!res.ok) throw new Error(await res.text());
            toast.info("Starting rescan process...");
        } catch (e: any) {
            console.error("Rescan failed", e);
            toast.error(`Failed to start rescan: ${e.message}`);
            setIsRescanning(false);
            setPendingConnId(null);
        }
    };

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
                        ...initialMetadata,
                        allowedContexts: dbList,
                        ...(channel === 'slack' ? { signingSecret, appToken } : {})
                    },
                    token: channel !== 'whatsapp' ? token : undefined,
                    agentUrl
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

    const handleDelete = async () => {
        setIsDeleting(true);
        try {
            const response = await fetch(`/api/connections?id=${connectionId}`, {
                method: 'DELETE'
            });
            if (!response.ok) throw new Error("Failed to delete");
            toast.success("Connection deleted successfully");
            onDelete(connectionId);
        } catch (error) {
            console.error("Failed to delete connection", error);
            toast.error("Failed to delete connection");
            setIsDeleting(false);
        }
    };

    const renderContextBadge = (ctx: ContextItem) => {
        const { id, name, type, image } = ctx;

        return (
            <div key={id} className="flex items-center justify-between p-2.5 rounded-xl hover:bg-zinc-50 dark:hover:bg-white/5 transition-all group border border-zinc-100 dark:border-white/5 shadow-sm bg-card">
                <div className="flex items-center gap-3 overflow-hidden">
                    {image ? (
                        <img src={image} alt={name} className="w-9 h-9 rounded-full object-cover shadow-sm" />
                    ) : (
                        <div className="w-9 h-9 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-xs font-bold text-zinc-600 dark:text-zinc-200">
                            {name.substring(0, 1).toUpperCase()}
                        </div>
                    )}
                    <div className="flex flex-col min-w-0">
                        <span className="text-sm font-bold truncate text-foreground">{name}</span>
                        <div className="flex items-center gap-2">
                            <span className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/60">{type}</span>
                            <span className="text-[9px] text-muted-foreground/30 font-mono truncate max-w-[80px]">{id}</span>
                        </div>
                    </div>
                </div>
                <Button variant="ghost" size="icon" onClick={() => handleRemove(id)} className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/5 rounded-full opacity-0 group-hover:opacity-100 transition-all">
                    <X className="h-4 w-4" />
                </Button>
            </div>
        );
    };

    return (
        <div className="flex flex-col h-full overflow-hidden animate-in fade-in zoom-in-95 duration-300">
            <div className="p-6 overflow-y-auto">
                <div className="space-y-6">
                    {/* Access Control - WhatsApp Only */}
                    {channel === 'whatsapp' && (
                        <>
                            <div className="flex items-center justify-between">
                                <div>
                                    <h3 className="text-lg font-bold text-foreground">Access Control</h3>
                                    <p className="text-sm text-muted-foreground">
                                        Manage who can interact with this connection.
                                    </p>
                                </div>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={handleRescan}
                                    disabled={isRescanning}
                                    className="rounded-full border-primary/20 hover:bg-primary/5 text-primary text-[10px] font-black uppercase tracking-widest h-9 px-4 flex items-center gap-2"
                                >
                                    {isRescanning ? <RefreshCw className="h-3 w-3 animate-spin" /> : <QrCode className="h-3 w-3" />}
                                    Rescan QR
                                </Button>
                            </div>

                            {/* QR Rescan Section - remains same */}
                            {isRescanning && pendingConnId && channel === 'whatsapp' && (
                                <div className="p-4 rounded-2xl bg-zinc-50 dark:bg-white/5 border border-zinc-200 dark:border-white/5 flex flex-col items-start justify-start space-y-4 animate-in fade-in slide-in-from-top-4">
                                    <div className="text-left space-y-1">
                                        <h4 className="text-sm font-black uppercase tracking-widest text-foreground">Scan the QR</h4>
                                        <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest flex items-center gap-2">
                                            <Shield className="h-3 w-3" /> Secure Baileys Encrypted Session
                                        </p>
                                    </div>

                                    <div className="relative p-4 bg-white dark:bg-black rounded-2xl border border-zinc-200 dark:border-white/10">
                                        {connStatus === 'qr' && currentQR ? (
                                            <div className="animate-in fade-in zoom-in-95 duration-500">
                                                <QRCodeSVG value={currentQR} size={160} level="H" />
                                            </div>
                                        ) : (
                                            <div className="relative h-[160px] w-[160px] flex items-center justify-center">
                                                <div className="absolute inset-0 rounded-full border border-zinc-100 dark:border-white/5 animate-pulse" />
                                                <div className="relative z-10 w-12 h-12 flex items-center justify-center">
                                                    <img src="/whatsapp.svg" className="h-10 w-10 animate-bounce" alt="WhatsApp" />
                                                </div>
                                            </div>
                                        )}
                                    </div>

                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        className="text-[9px] font-black uppercase tracking-widest text-muted-foreground hover:text-red-500 h-auto p-0"
                                        onClick={() => {
                                            setIsRescanning(false);
                                            setPendingConnId(null);
                                            setCurrentQR(null);
                                        }}
                                    >
                                        Stop Reconnecting
                                    </Button>
                                </div>
                            )}

                            {/* Add New Input */}
                            <div className="relative group max-w-2xl">
                                <Input
                                    placeholder="Enter Phone Number (e.g. 1234567890) or ID"
                                    value={newJid}
                                    onChange={(e) => setNewJid(e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
                                    className="h-14 bg-background border-zinc-200 dark:border-white/10 focus:border-primary focus:ring-4 focus:ring-primary/5 rounded-2xl transition-all pl-6 pr-16 shadow-sm"
                                />
                                <button
                                    onClick={handleAdd}
                                    className="absolute right-2 top-1/2 -translate-y-1/2 h-10 w-10 rounded-xl bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 flex items-center justify-center hover:scale-105 active:scale-95 transition-all shadow-md"
                                >
                                    <Plus className="h-5 w-5" />
                                </button>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                {/* Left Column: Groups/Contacts (Available) */}
                                <div className="space-y-3">
                                    <div className="flex items-center justify-between">
                                        <span className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground/60 flex items-center gap-2">
                                            Groups / Contacts
                                            {isLoadingContexts && <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />}
                                        </span>
                                        <button
                                            onClick={fetchContexts}
                                            className="text-[10px] font-bold text-primary hover:text-primary/80 transition-colors flex items-center gap-1.5 group"
                                        >
                                            <RefreshCw className="h-3 w-3 group-hover:rotate-180 transition-transform duration-500" />
                                            Refresh
                                        </button>
                                    </div>

                                    <div className="bg-zinc-50/80 dark:bg-white/5 border border-zinc-200/50 dark:border-white/10 rounded-3xl p-3 flex flex-col gap-2 h-[340px] overflow-y-auto custom-scrollbar">
                                        {isLoadingContexts ? (
                                            Array.from({ length: 5 }).map((_, i) => (
                                                <div key={i} className="h-12 w-full bg-muted/20 rounded-xl animate-pulse" />
                                            ))
                                        ) : availableContexts.length > 0 ? (
                                            availableContexts.map(ctx => (
                                                <button
                                                    key={ctx.id}
                                                    onClick={() => handleAddContext(ctx)}
                                                    className="flex items-center gap-3 p-2.5 text-left hover:bg-zinc-50 dark:hover:bg-white/5 rounded-xl transition-all group w-full border border-transparent hover:border-zinc-200 dark:hover:border-white/5"
                                                    title={ctx.id}
                                                >
                                                    {ctx.image ? (
                                                        <img src={ctx.image} alt={ctx.name} className="w-9 h-9 rounded-full object-cover bg-muted shrink-0 shadow-sm" />
                                                    ) : (
                                                        <div className="w-9 h-9 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-xs font-bold text-zinc-600 dark:text-zinc-400 shrink-0">
                                                            {ctx.name.substring(0, 1).toUpperCase()}
                                                        </div>
                                                    )}
                                                    <div className="flex flex-col flex-1 min-w-0">
                                                        <span className="text-sm font-semibold truncate text-foreground group-hover:text-primary transition-colors">{ctx.name}</span>
                                                        <div className="flex items-center gap-2">
                                                            <span className="text-[10px] text-muted-foreground/60 font-medium uppercase tracking-wider">{ctx.type}</span>
                                                        </div>
                                                    </div>
                                                    <div className="h-8 w-8 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all bg-primary/10 text-primary">
                                                        <Plus className="h-4 w-4" />
                                                    </div>
                                                </button>
                                            ))
                                        ) : (
                                            <div className="flex flex-col items-center justify-center h-full text-center p-8 rounded-2xl opacity-40 m-auto">
                                                <span className="text-xs font-medium text-muted-foreground italic">No active targets detected.</span>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* Right Column: Saved Allowlist */}
                                <div className="space-y-3">
                                    <div className="flex items-center justify-between">
                                        <span className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground/60">
                                            Allowlist
                                        </span>
                                        <span className="text-[10px] font-bold bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 px-2.5 py-0.5 rounded-full shadow-sm">
                                            {allowedContexts.length} ACTIVE
                                        </span>
                                    </div>

                                    <div className="bg-zinc-50/80 dark:bg-white/5 border border-zinc-200/50 dark:border-white/10 rounded-3xl p-3 min-h-[340px] flex flex-col gap-2">
                                        {allowedContexts.length === 0 ? (
                                            <div className="h-full flex flex-col items-center justify-center text-center space-y-3 opacity-40 m-auto py-10 rounded-2xl w-full">
                                                <div className="w-12 h-12 rounded-2xl bg-zinc-100 dark:bg-white/5 flex items-center justify-center">
                                                    <Shield className="h-6 w-6 text-muted-foreground" />
                                                </div>
                                                <div className="space-y-1">
                                                    <span className="text-xs font-semibold text-foreground block">No restrictions enabled</span>
                                                    <span className="text-[10px] text-muted-foreground">The bot will respond to everyone.</span>
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="space-y-2 pr-2 overflow-y-auto max-h-[320px] custom-scrollbar">
                                                {allowedContexts.map(ctx => renderContextBadge(ctx))}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </>
                    )}

                    {/* Connection Configuration */}
                    <div className="space-y-4 pt-6 border-t border-zinc-100 dark:border-white/5">
                        <h3 className="text-lg font-bold text-foreground">Connection Configuration</h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            {channel !== 'whatsapp' && (
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground/60">
                                        {channel === 'slack' ? 'Bot User OAuth Token' : 'Bot Token'}
                                    </label>
                                    <div className="relative group/field">
                                        <Input
                                            type={showToken ? "text" : "password"}
                                            value={token}
                                            onChange={(e) => setToken(e.target.value)}
                                            className="h-12 bg-zinc-50/50 dark:bg-white/5 border-zinc-200 dark:border-white/10 rounded-2xl focus:ring-primary/5 pr-12"
                                            placeholder={channel === 'slack' ? "xoxb-..." : "Enter bot token"}
                                        />
                                        <button
                                            type="button"
                                            onClick={() => setShowToken(!showToken)}
                                            className="absolute right-3 top-1/2 -translate-y-1/2 p-2 rounded-xl text-muted-foreground/40 hover:text-muted-foreground hover:bg-zinc-100 dark:hover:bg-white/10 transition-all"
                                        >
                                            {showToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                        </button>
                                    </div>
                                </div>
                            )}
                            <div className="space-y-2">
                                <label className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground/60">Agent URL</label>
                                <Input
                                    value={agentUrl}
                                    onChange={(e) => setAgentUrl(e.target.value)}
                                    className="h-12 bg-zinc-50/50 dark:bg-white/5 border-zinc-200 dark:border-white/10 rounded-2xl focus:ring-primary/5"
                                    placeholder="https://your-agent.com/agent"
                                />
                            </div>

                            {channel === 'slack' && (
                                <>
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground/60">Signing Secret</label>
                                        <div className="relative group/field">
                                            <Input
                                                type={showSigningSecret ? "text" : "password"}
                                                value={signingSecret}
                                                onChange={(e) => setSigningSecret(e.target.value)}
                                                className="h-12 bg-zinc-50/50 dark:bg-white/5 border-zinc-200 dark:border-white/10 rounded-2xl focus:ring-primary/5 pr-12"
                                                placeholder="Your Slack App Signing Secret"
                                            />
                                            <button
                                                type="button"
                                                onClick={() => setShowSigningSecret(!showSigningSecret)}
                                                className="absolute right-3 top-1/2 -translate-y-1/2 p-2 rounded-xl text-muted-foreground/40 hover:text-muted-foreground hover:bg-zinc-100 dark:hover:bg-white/10 transition-all"
                                            >
                                                {showSigningSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                            </button>
                                        </div>
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground/60">App-Level Token (Socket Mode)</label>
                                        <div className="relative group/field">
                                            <Input
                                                type={showAppToken ? "text" : "password"}
                                                value={appToken}
                                                onChange={(e) => setAppToken(e.target.value)}
                                                className="h-12 bg-zinc-50/50 dark:bg-white/5 border-zinc-200 dark:border-white/10 rounded-2xl focus:ring-primary/5 pr-12"
                                                placeholder="xapp-..."
                                            />
                                            <button
                                                type="button"
                                                onClick={() => setShowAppToken(!showAppToken)}
                                                className="absolute right-3 top-1/2 -translate-y-1/2 p-2 rounded-xl text-muted-foreground/40 hover:text-muted-foreground hover:bg-zinc-100 dark:hover:bg-white/10 transition-all"
                                            >
                                                {showAppToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                            </button>
                                        </div>
                                    </div>
                                </>
                            )}
                        </div>
                    </div>

                    <div className="pt-8 flex flex-col md:flex-row items-center justify-between gap-6 border-t border-zinc-100 dark:border-white/5">
                        <div className="flex items-center gap-4 w-full md:w-auto">
                            <Button onClick={handleSave} disabled={saving} className="flex-1 md:min-w-[200px] h-12 rounded-xl font-bold uppercase tracking-widest text-xs shadow-lg hover:shadow-xl transition-all">
                                {saving ? <RefreshCw className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
                                {saving ? "Saving..." : "Save Changes"}
                            </Button>
                            <Button variant="outline" onClick={onBack} className="h-12 rounded-xl text-xs font-bold px-6">
                                Cancel
                            </Button>
                        </div>

                        <div className="w-full md:w-auto p-4 rounded-2xl bg-red-500/5 border border-red-500/10 flex items-center justify-between gap-4">
                            <div className="space-y-1">
                                <p className="text-[10px] font-black uppercase tracking-widest text-red-600 dark:text-red-400">Dangerous Zone</p>
                                <p className="text-[9px] text-muted-foreground">Remove this connection permanently.</p>
                            </div>
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={handleDelete}
                                disabled={isDeleting}
                                className="text-red-600 hover:text-white hover:bg-red-600 rounded-xl text-[10px] font-black uppercase tracking-widest h-10 px-4 transition-all"
                            >
                                {isDeleting ? "Deleting..." : "Delete"}
                            </Button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
