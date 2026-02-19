"use client"

import Image from "next/image"
import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import ConnectionSettings from "@/components/ConnectionSettings"
import LLMKeySettings from "@/components/LLMKeySettings"
import UsageStats from "@/components/UsageStats"
import { Loader2, Plus, Bot, Power, Trash2, ChevronRight, Settings, Shield, ArrowRight, Brain, Key } from "lucide-react"
import { QRCodeSVG } from "qrcode.react"
import { Header } from "@/components/layout/header"
import { toast } from "sonner"
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from "@/components/ui/tooltip"


export default function DashboardPage() {
    const [user, setUser] = useState<any>(null)
    const [loading, setLoading] = useState(true)
    const [connections, setConnections] = useState<any[]>([])
    const [isDeveloper, setIsDeveloper] = useState(false)

    // Form states
    const [botToken, setBotToken] = useState("")
    const [agentUrl, setAgentUrl] = useState("http://127.0.0.1:8001/agent")
    const [channel, setChannel] = useState("telegram")
    const [adding, setAdding] = useState(false)
    const [slackSigningSecret, setSlackSigningSecret] = useState("")
    const [slackAppToken, setSlackAppToken] = useState("")
    const [discordRespondToAll, setDiscordRespondToAll] = useState(false)
    const [llmKeys, setLlmKeys] = useState({
        openai: "",
        google: "",
        grok: "",
        anthropic: "",
        deepseek: ""
    })

    // QR & Status states
    const [showQR, setShowQR] = useState(false)
    const [currentQR, setCurrentQR] = useState<string | null>(null)
    const [pendingConnId, setPendingConnId] = useState<string | null>(null)
    const [connStatus, setConnStatus] = useState<string>("initializing")

    const [activeTab, setActiveTab] = useState("connections")
    const [selectedConnectionId, setSelectedConnectionId] = useState<string | null>(null)

    const supabase = createClient()
    const router = useRouter()

    useEffect(() => {
        async function fetchData() {
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) {
                router.push('/login')
                return
            }
            setUser(user)
            setIsDeveloper(!!user?.user_metadata?.is_developer)

            try {
                const response = await fetch("/api/connections")
                if (response.ok) {
                    const data = await response.json()
                    setConnections(data)
                }
            } catch (err) {
                console.error("Fetch failed", err)
                toast.error("Unable to load connections. Please ensure the Hub is running.")
            }
            setLoading(false)
        }
        fetchData()

        const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
            if (session?.user) {
                setUser(session.user)
                setIsDeveloper(!!session.user.user_metadata.is_developer)
            }
        })

        return () => {
            subscription.unsubscribe()
        }
    }, [])

    // Poll for QR code
    useEffect(() => {
        if (!pendingConnId) return

        let pollInterval: NodeJS.Timeout

        const checkStatus = async () => {
            try {
                const res = await fetch(`/api/connections/${pendingConnId}/status`)
                if (res.ok) {
                    const data = await res.json()
                    if (data.type === 'qr' && data.data) {
                        setCurrentQR(data.data)
                        setConnStatus('qr')
                    }
                    if (data.type === 'connected' || data.status === 'connected') {
                        setConnStatus('connected')
                        setTimeout(async () => {
                            setPendingConnId(null)
                            toast.success("WhatsApp connected successfully!")
                            // Refresh connections list to show updated status
                            const updated = await fetch("/api/connections")
                            if (updated.ok) setConnections(await updated.json())
                            setActiveTab("connections")
                        }, 1000)
                    }
                }
            } catch (err) {
                console.error("Poll failed", err)
            }
        }

        checkStatus()
        pollInterval = setInterval(checkStatus, 2000)

        // Only clear the interval — Hub janitor handles connection cleanup
        return () => clearInterval(pollInterval)
    }, [pendingConnId, showQR])

    const handleAddConnection = async (e: React.FormEvent) => {
        e.preventDefault()
        setAdding(true)

        // Clear previous state
        setConnStatus("initializing")
        setCurrentQR(null)

        const connectionId = `gw-${Math.random().toString(36).substr(2, 9)}`;

        try {
            const response = await fetch("/api/connections", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    connectionId: connectionId,
                    channel,
                    token: channel === 'whatsapp' ? 'wa-session' : botToken,
                    userId: user?.id,
                    agentUrl: isDeveloper ? agentUrl : "http://127.0.0.1:8001/agent",
                    metadata: {
                        ...(channel === 'slack' ? {
                            signingSecret: slackSigningSecret,
                            appToken: slackAppToken
                        } : {}),
                        ...(channel === 'discord' ? {
                            respondToAll: discordRespondToAll
                        } : {})
                    }
                }),
            })

            if (!response.ok) {
                const error = await response.json()
                throw new Error(error.error || "Failed to deploy gateway")
            }

            const newConn = await response.json()
            setConnections([newConn, ...connections])

            if (channel === 'whatsapp') {
                setPendingConnId(newConn.id)
            } else {
                setBotToken("")
                setSlackSigningSecret("")
                setSlackAppToken("")
                setDiscordRespondToAll(false)
                setActiveTab("connections")
            }
            setAdding(false)
        } catch (err: any) {
            toast.error(err.message || "Failed to deploy gateway. Please check your token and try again.")
            setAdding(false)
        }
    }

    const handleDeleteConnection = async (id: string) => {
        try {
            const response = await fetch(`/api/connections/${id}`, {
                method: "DELETE",
            })
            if (response.ok) {
                setConnections(connections.filter(c => c.id !== id))
            } else {
                toast.error("Failed to delete connection.")
            }
        } catch (err) {
            console.error("Delete failed", err)
            toast.error("Failed to delete connection. Please try again.")
        }
    }

    const handleStopConnection = async (id: string) => {
        try {
            const res = await fetch(`/api/connections/${id}/stop`, { method: "POST" });
            if (!res.ok) throw new Error(await res.text());
            const updated = connections.map(c => c.id === id ? { ...c, status: 'stopped' } : c);
            setConnections(updated);
        } catch (e) {
            console.error("Stop failed", e);
            toast.error("Failed to stop gateway.");
        }
    };

    const handleScanQR = async (id: string) => {
        try {
            setPendingConnId(id);
            setConnStatus("initializing");
            const res = await fetch(`/api/connections/${id}/scan-qr`, { method: "POST" });
            if (!res.ok) throw new Error(await res.text());
        } catch (e: any) {
            console.error("Scan QR failed", e);
            toast.error(`Failed to start scan: ${e.message}`);
        }
    };

    const PlatformIcon = ({ channel }: { channel: string }) => {
        return <Image src={`/platforms/${channel}.svg`} width={16} height={16} className="h-4 w-4" alt={channel} />
    }

    const SpinningLoader = () => (
        <div className="flex flex-col items-center justify-center space-y-4 py-8">
            <div className="relative">
                <div className="absolute inset-0 rounded-full border-2 border-primary/10 animate-pulse" />
                <Loader2 className="h-8 w-8 text-primary animate-spin" />
            </div>
            <p className="text-[9px] font-black uppercase tracking-[0.2em] text-muted-foreground/60 animate-pulse">Initializing Protocol...</p>
        </div>
    );

    return (
        <main className="max-w-4xl mx-auto p-4 md:p-8 space-y-12 animate-in fade-in slide-in-from-bottom-8 duration-1000">

            <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500 mb-8">
                <span className="cursor-pointer hover:text-zinc-900 dark:text-white transition-colors" onClick={() => {
                    setActiveTab('connections');
                    setSelectedConnectionId(null);
                }}>CONNECTIONS</span>
                {activeTab === 'add' && (
                    <>
                        <ChevronRight className="h-3 w-3" />
                        <span className="text-zinc-900 dark:text-white animate-in fade-in slide-in-from-left-2">
                            Add Gateway
                        </span>
                    </>
                )}
                {activeTab === 'settings' && (
                    <>
                        <ChevronRight className="h-3 w-3" />
                        <span className="text-zinc-900 dark:text-white animate-in fade-in slide-in-from-left-2">
                            Settings
                        </span>
                    </>
                )}
                {activeTab === 'brain' && !isDeveloper && (
                    <>
                        <ChevronRight className="h-3 w-3" />
                        <span className="text-zinc-900 dark:text-white animate-in fade-in slide-in-from-left-2">
                            LLM API Keys
                        </span>
                    </>
                )}
            </div>

            <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
                {activeTab === 'connections' && !selectedConnectionId && (
                    <div className="flex items-center justify-between mb-4">
                        <TabsList className="bg-zinc-100 dark:bg-white/5 p-1 rounded-2xl h-12">
                            <TabsTrigger value="connections" className="rounded-xl px-6 h-10 data-[state=active]:bg-white dark:data-[state=active]:bg-zinc-800 data-[state=active]:shadow-sm text-[10px] font-black uppercase tracking-widest">Workspace</TabsTrigger>
                            {!isDeveloper && (
                                <TabsTrigger value="brain" className="rounded-xl px-6 h-10 data-[state=active]:bg-white dark:data-[state=active]:bg-zinc-800 data-[state=active]:shadow-sm text-[10px] font-black uppercase tracking-widest">LLM API Keys</TabsTrigger>
                            )}
                        </TabsList>
                    </div>
                )}


                <TabsContent value="connections" className="space-y-10 animate-in fade-in zoom-in-95 duration-500">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <div className="p-6 rounded-2xl bg-zinc-50 dark:bg-white/5 border border-zinc-100 dark:border-white/5 relative group overflow-hidden">
                            <div className="space-y-1 relative z-10">
                                <span className="text-zinc-500 text-[10px] font-bold uppercase tracking-[0.2em]">Active Proxies</span>
                                <div className="text-4xl font-black font-mono tracking-tighter text-zinc-900 dark:text-white">
                                    {loading ? (
                                        <div className="h-10 w-12 bg-zinc-200 dark:bg-zinc-800 animate-pulse rounded-lg" />
                                    ) : (
                                        connections.filter(c => c.status === 'active' || c.status === 'connected').length
                                    )}
                                </div>
                            </div>
                            <div className="absolute top-0 right-0 p-6 opacity-10 dark:opacity-5 group-hover:opacity-20 transition-all duration-700 group-hover:scale-110 group-hover:-rotate-12">
                                <Bot className="h-12 w-12 text-zinc-900 dark:text-white" />
                            </div>
                        </div>
                        <div className="p-6 rounded-2xl bg-zinc-50 dark:bg-white/5 border border-zinc-100 dark:border-white/5 relative group overflow-hidden">
                            <div className="space-y-1 relative z-10">
                                <span className="text-zinc-500 text-[10px] font-bold uppercase tracking-[0.2em]">Total Connections</span>
                                <div className="text-4xl font-black font-mono tracking-tighter text-zinc-900 dark:text-white">
                                    {loading ? (
                                        <div className="h-10 w-12 bg-zinc-200 dark:bg-zinc-800 animate-pulse rounded-lg" />
                                    ) : (
                                        connections.length
                                    )}
                                </div>
                            </div>
                            <div className="absolute top-0 right-0 p-6 opacity-10 dark:opacity-5 group-hover:opacity-20 transition-all duration-700 group-hover:scale-110 group-hover:-rotate-12">
                                <Plus className="h-12 w-12 text-zinc-900 dark:text-white" />
                            </div>
                        </div>
                    </div>

                    {/* Usage Stats Card */}
                    <div className="p-6 rounded-2xl bg-zinc-50 dark:bg-white/5 border border-zinc-100 dark:border-white/5 relative group overflow-hidden">
                        <UsageStats externalLoading={loading} />
                    </div>

                    <div className="space-y-6">
                        <div className="flex flex-row items-center justify-between px-2">
                            <div>
                                <h3 className="text-xl font-bold tracking-tight text-zinc-900 dark:text-white">Active Gateways</h3>
                                <p className="text-zinc-500 text-xs font-medium mt-1">Global messenger-to-agent streaming connections.</p>
                            </div>
                            <Button size="sm" className="bg-zinc-900 dark:bg-white text-white dark:text-black hover:bg-zinc-800 dark:hover:bg-zinc-200 rounded-full h-10 px-6 font-black text-[10px] uppercase tracking-widest transition-all hover:scale-105 shadow-none" onClick={() => setActiveTab("add")}>
                                <Plus className="h-3.5 w-3.5 mr-2" /> Add Gateway
                            </Button>
                        </div>
                        <div className="px-2">
                            <Table>
                                <TableHeader className="border-zinc-200 dark:border-white/10">
                                    <TableRow className="hover:bg-transparent border-zinc-200 dark:border-white/10">
                                        <TableHead className="text-zinc-500 text-xs uppercase w-24">Platform</TableHead>
                                        <TableHead className="text-zinc-500 text-xs uppercase">Identity</TableHead>
                                        {isDeveloper && (
                                            <TableHead className="text-zinc-500 text-xs uppercase">Agent Endpoint</TableHead>
                                        )}
                                        <TableHead className="text-zinc-500 text-xs uppercase text-center">Status</TableHead>
                                        <TableHead className="text-right text-zinc-500 text-xs uppercase">Manage</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {loading ? (
                                        Array.from({ length: 3 }).map((_, i) => (
                                            <TableRow key={`loading-${i}`} className="border-zinc-50 dark:border-white/5">
                                                <TableCell><div className="h-4 w-20 bg-zinc-100 dark:bg-zinc-800 animate-pulse rounded" /></TableCell>
                                                <TableCell><div className="h-4 w-32 bg-zinc-100 dark:bg-zinc-800 animate-pulse rounded" /></TableCell>
                                                {isDeveloper && <TableCell><div className="h-4 w-40 bg-zinc-100 dark:bg-zinc-800 animate-pulse rounded" /></TableCell>}
                                                <TableCell><div className="h-6 w-16 mx-auto bg-zinc-100 dark:bg-zinc-800 animate-pulse rounded-full" /></TableCell>
                                                <TableCell className="text-right"><div className="h-8 w-8 ml-auto bg-zinc-100 dark:bg-zinc-800 animate-pulse rounded" /></TableCell>
                                            </TableRow>
                                        ))
                                    ) : connections.length === 0 ? (
                                        <TableRow className="border-zinc-200 dark:border-white/5">
                                            <TableCell colSpan={5} className="text-center py-10 text-zinc-500 italic">No active connections found.</TableCell>
                                        </TableRow>
                                    ) : connections.map((conn) => (
                                        <TableRow key={conn.id} className="border-zinc-50 dark:border-white/5 hover:bg-zinc-50/50 dark:hover:bg-white/[0.02] transition-colors group">
                                            {/* ... existing cells ... */}
                                            <TableCell className="font-medium">
                                                <div className="flex items-center gap-3 capitalize w-fit px-3 py-1 rounded-full">
                                                    <PlatformIcon channel={conn.channel} />
                                                    <span className="text-xs text-zinc-900 dark:text-zinc-100">{conn.channel}</span>
                                                </div>
                                            </TableCell>
                                            <TableCell className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{conn.userId || 'Linked Bot'}</TableCell>
                                            {isDeveloper && (
                                                <TableCell>
                                                    <code className="text-[10px] bg-zinc-100 dark:bg-black border border-zinc-200 dark:border-zinc-800 px-2 py-1 rounded text-zinc-500 dark:text-zinc-400 font-mono">
                                                        {conn.agentUrl}
                                                    </code>
                                                </TableCell>
                                            )}
                                            <TableCell>
                                                <div className="flex items-center justify-center gap-2">
                                                    <Badge variant="outline"
                                                        className={conn.status === 'active' || conn.status === 'connected' ? 'bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20' : conn.status === 'initializing' || conn.status === 'qr' || conn.status === 'reconnecting' ? 'bg-yellow-500/10 text-yellow-600 dark:text-yellow-500 border-yellow-500/20' : 'bg-red-500/10 text-red-600 dark:text-red-500 border-red-500/20'}>
                                                        <div className={`h-1.5 w-1.5 rounded-full mr-1.5 animate-pulse ${conn.status === 'active' || conn.status === 'connected' ? 'bg-green-500' : 'bg-yellow-500'}`} />
                                                        {conn.status}
                                                    </Badge>
                                                </div>
                                            </TableCell>
                                            <TableCell className="text-right space-x-1">
                                                <TooltipProvider>
                                                    <Tooltip>
                                                        <TooltipTrigger asChild>
                                                            <Button variant="ghost" size="icon" className="h-8 w-8 text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-white/10"
                                                                onClick={() => {
                                                                    setSelectedConnectionId(conn.id);
                                                                    setActiveTab('settings');
                                                                }}
                                                            >
                                                                <Settings className="h-3.5 w-3.5" />
                                                            </Button>
                                                        </TooltipTrigger>
                                                        <TooltipContent>
                                                            <p className="text-[10px] uppercase font-bold tracking-widest">Configure Settings</p>
                                                        </TooltipContent>
                                                    </Tooltip>
                                                    <Tooltip>
                                                        <TooltipTrigger asChild>
                                                            <Button variant="ghost" size="icon" className="h-8 w-8 text-zinc-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-500/10" onClick={() => handleDeleteConnection(conn.id)}>
                                                                <Trash2 className="h-3.5 w-3.5" />
                                                            </Button>
                                                        </TooltipTrigger>
                                                        <TooltipContent>
                                                            <p className="text-[10px] uppercase font-bold tracking-widest">Delete Connection</p>
                                                        </TooltipContent>
                                                    </Tooltip>
                                                </TooltipProvider>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                    </div>
                </TabsContent>

                <TabsContent value="add" className="animate-in fade-in slide-in-from-right-8 duration-700 w-full overflow-hidden">
                    <div className="w-full relative text-zinc-100">
                        <div className="absolute -top-12 -right-12 p-8 opacity-[0.03] rotate-12">
                            <Plus className="h-64 w-64" />
                        </div>

                        <div className="mb-8">
                            <h2 className="text-2xl font-black tracking-tight uppercase text-gradient-premium">Add Gateway</h2>
                            <p className="text-zinc-500 font-medium mt-1">
                                Bridge your messenger platform to the remote agent.
                            </p>
                        </div>

                        <form onSubmit={handleAddConnection} className="relative z-10">
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-20">
                                <div className="space-y-10">
                                    <div className="space-y-4">
                                        <label className="text-[10px] font-black uppercase tracking-[0.3em] text-zinc-500">Platform Protocol</label>
                                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
                                            {['telegram', 'whatsapp', 'discord', 'slack'].map((p) => (
                                                <button
                                                    key={p}
                                                    type="button"
                                                    className={`group relative flex flex-col items-center justify-center gap-4 p-3 rounded-xl border transition-all duration-500 overflow-hidden ${channel === p ? 'bg-primary/10 border-primary/40' : 'bg-muted/40 border-border/40 hover:border-primary/20 hover:bg-muted/60'}`}
                                                    onClick={() => setChannel(p)}
                                                >
                                                    <Image src={`/platforms/${p}.svg`} width={40} height={40} className={`h-10 w-10 transition-all duration-500 ${channel === p ? 'opacity-100 drop-shadow-lg' : 'opacity-50 group-hover:opacity-100'}`} alt={p} />
                                                    <span className={`text-[8px] md:text-[10px] font-black uppercase tracking-[0.2em] transition-all duration-500 ${channel === p ? 'text-foreground' : 'text-zinc-500 group-hover:text-zinc-700 dark:group-hover:text-zinc-300'}`}>{p}</span>
                                                </button>
                                            ))}
                                        </div>
                                    </div>


                                </div>

                                <div className="space-y-10">
                                    {channel !== 'whatsapp' && (
                                        <div className="space-y-4 animate-in fade-in slide-in-from-top-4 duration-500">
                                            <label htmlFor="token" className="text-[10px] font-black uppercase tracking-[0.3em] text-zinc-500">
                                                {channel === 'slack' ? 'Bot User OAuth Token' : 'Bot Secret Token'}
                                            </label>
                                            <Input
                                                id="token"
                                                type="password"
                                                placeholder={channel === 'slack' ? "xoxb-..." : "e.g. 123456789:ABCDef..."}
                                                className="bg-zinc-100 dark:bg-black/40 border-zinc-200 dark:border-white/5 focus:border-zinc-400 dark:focus:border-white/20 h-10 rounded-xl text-xs text-foreground"
                                                value={botToken}
                                                onChange={(e) => setBotToken(e.target.value)}
                                                required
                                            />
                                            {channel === 'slack' ? (
                                                <p className="text-[9px] text-zinc-600 font-bold uppercase tracking-widest flex items-center gap-2">
                                                    <Key className="h-3 w-3" /> Bot Token from App Settings
                                                </p>
                                            ) : (
                                                <p className="text-[9px] text-zinc-600 font-bold uppercase tracking-widest flex items-center gap-2">
                                                    <Power className="h-3 w-3" /> Secure long-poll connection via Linkos Relay
                                                </p>
                                            )}
                                        </div>
                                    )}

                                    {channel === 'slack' && (
                                        <div className="space-y-6 animate-in fade-in slide-in-from-top-4 duration-500">
                                            <div className="space-y-4">
                                                <label htmlFor="slackSigningSecret" className="text-[10px] font-black uppercase tracking-[0.3em] text-zinc-500">Signing Secret</label>
                                                <Input
                                                    id="slackSigningSecret"
                                                    type="password"
                                                    placeholder="Your Slack App Signing Secret"
                                                    className="bg-zinc-100 dark:bg-black/40 border-zinc-200 dark:border-white/5 focus:border-zinc-400 dark:focus:border-white/20 h-10 rounded-xl text-xs text-foreground"
                                                    value={slackSigningSecret}
                                                    onChange={(e) => setSlackSigningSecret(e.target.value)}
                                                    required
                                                />
                                            </div>

                                            <div className="space-y-4">
                                                <label htmlFor="slackAppToken" className="text-[10px] font-black uppercase tracking-[0.3em] text-zinc-500">App-Level Token (Socket Mode)</label>
                                                <Input
                                                    id="slackAppToken"
                                                    type="password"
                                                    placeholder="xapp-..."
                                                    className="bg-zinc-100 dark:bg-black/40 border-zinc-200 dark:border-white/5 focus:border-zinc-400 dark:focus:border-white/20 h-10 rounded-xl text-xs text-foreground"
                                                    value={slackAppToken}
                                                    onChange={(e) => setSlackAppToken(e.target.value)}
                                                    required
                                                />
                                            </div>
                                        </div>
                                    )}

                                    {channel === 'discord' && (
                                        <div className="flex items-center space-x-3 p-4 rounded-xl bg-zinc-100 dark:bg-white/5 border border-zinc-200 dark:border-white/10 animate-in fade-in slide-in-from-top-4 duration-500">
                                            <div className="flex items-center h-5">
                                                <input
                                                    id="discordRespondToAll"
                                                    type="checkbox"
                                                    className="h-4 w-4 rounded border-zinc-300 text-zinc-900 focus:ring-zinc-500"
                                                    checked={discordRespondToAll}
                                                    onChange={(e) => setDiscordRespondToAll(e.target.checked)}
                                                />
                                            </div>
                                            <div className="ml-3 text-xs">
                                                <label htmlFor="discordRespondToAll" className="font-bold text-zinc-700 dark:text-zinc-300 uppercase tracking-widest text-[9px]">Respond to All Messages</label>
                                                <p className="text-zinc-500 text-[10px]">By default, bot only responds to @mentions.</p>
                                            </div>
                                        </div>
                                    )}

                                    {channel === 'whatsapp' && (
                                        <div className="space-y-6 animate-in fade-in slide-in-from-top-4 duration-500">
                                            <div className="p-6 rounded-2xl bg-zinc-100 dark:bg-white/5 border border-zinc-200 dark:border-white/10 flex items-center gap-5">
                                                <Shield className="h-6 w-6 text-zinc-400 dark:text-white/40" />
                                                <div className="space-y-1">
                                                    <p className="text-xs font-black uppercase tracking-widest text-zinc-700 dark:text-white/80">Account Session</p>
                                                    <p className="text-[10px] text-zinc-500 font-medium leading-relaxed">WhatsApp uses end-to-end QR authentication.</p>
                                                </div>
                                            </div>

                                            {pendingConnId && (
                                                <div className="p-6 rounded-3xl bg-zinc-50 dark:bg-white/5 border border-zinc-100 dark:border-white/5 shadow-sm flex flex-col items-center justify-center space-y-4 animate-in fade-in zoom-in-95 duration-500">
                                                    <div className="text-center space-y-1">
                                                        <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-foreground/80">Scan to Connect</h4>
                                                        <p className="text-[9px] text-muted-foreground font-bold uppercase tracking-widest opacity-60">Linked Devices {' > '} Pair Device</p>
                                                    </div>

                                                    <div className="relative bg-white dark:bg-black p-3 rounded-2xl shadow-sm border border-zinc-200 dark:border-white/5">
                                                        {connStatus === 'qr' && currentQR ? (
                                                            <div className="animate-in fade-in zoom-in-95 duration-500">
                                                                <QRCodeSVG value={currentQR} size={140} level="H" />
                                                            </div>
                                                        ) : (
                                                            <SpinningLoader />
                                                        )}
                                                    </div>

                                                    {connStatus === 'connected' ? (
                                                        <div className="flex items-center gap-2 text-green-500 animate-bounce">
                                                            <Shield className="h-4 w-4" />
                                                            <span className="text-[10px] font-black uppercase tracking-widest">Linked Successfully</span>
                                                        </div>
                                                    ) : (
                                                        <Button
                                                            type="button"
                                                            variant="ghost"
                                                            size="sm"
                                                            className="text-[9px] font-black uppercase tracking-widest text-zinc-400 hover:text-red-500 transition-colors"
                                                            onClick={async () => {
                                                                await handleStopConnection(pendingConnId as string);
                                                                setPendingConnId(null);
                                                                setCurrentQR(null);
                                                            }}
                                                        >
                                                            Cancel Connection
                                                        </Button>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {isDeveloper && (
                                        <div className="space-y-4 animate-in fade-in slide-in-from-top-4 duration-500">
                                            <label htmlFor="url" className="text-[10px] font-black uppercase tracking-[0.3em] text-zinc-500">Streaming Agent URL</label>
                                            <Input
                                                id="url"
                                                placeholder="https://your-agent.com/agent"
                                                className="bg-zinc-100 dark:bg-black/40 border-zinc-200 dark:border-white/5 focus:border-zinc-400 dark:focus:border-white/20 h-12 rounded-xl text-xs text-foreground"
                                                value={agentUrl}
                                                onChange={(e) => setAgentUrl(e.target.value)}
                                                required
                                            />
                                            <p className="text-[9px] text-zinc-600 font-bold uppercase tracking-widest">Tunneled via AG-UI binary streaming protocol</p>
                                        </div>
                                    )}


                                    <div className="space-y-4 pt-4">
                                        <Button
                                            className="w-full rounded-full h-14 font-black text-xs uppercase tracking-[0.3em] bg-zinc-900 hover:bg-zinc-800 text-white dark:bg-white dark:text-black dark:hover:bg-zinc-200 transition-all flex items-center justify-center gap-2 group shadow-xl hover:shadow-2xl hover:-translate-y-0.5"
                                            disabled={adding || (channel === 'whatsapp' && !!pendingConnId)}
                                        >
                                            {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : (
                                                <>
                                                    {channel === 'whatsapp' && pendingConnId ? 'Waiting for Scan...' : 'Add Gateway'}
                                                    <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                                                </>
                                            )}
                                        </Button>
                                        <div className="flex items-center justify-center gap-2 text-[10px] text-zinc-400 font-medium opacity-60">
                                            <Shield className="h-3 w-3" />
                                            <span>Your data is end-to-end encrypted. We do not access your messages.</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </form>
                    </div>
                </TabsContent>

                <TabsContent value="settings" className="animate-in fade-in slide-in-from-right-8 duration-700 w-full overflow-hidden">
                    {selectedConnectionId && (
                        <ConnectionSettings
                            connectionId={selectedConnectionId}
                            channel={connections.find(c => c.id === selectedConnectionId)?.channel}
                            status={connections.find(c => c.id === selectedConnectionId)?.status}
                            initialAllowedContexts={(connections.find(c => c.id === selectedConnectionId)?.metadata?.allowedContexts as any[]) || []}
                            initialMetadata={connections.find(c => c.id === selectedConnectionId)?.metadata}
                            initialToken={connections.find(c => c.id === selectedConnectionId)?.token}
                            initialAgentUrl={connections.find(c => c.id === selectedConnectionId)?.agentUrl}
                            onBack={() => setActiveTab('connections')}
                            onDelete={(id) => {
                                setConnections(connections.filter(c => c.id !== id));
                                setSelectedConnectionId(null);
                                setActiveTab('connections');
                            }}
                        />
                    )}
                </TabsContent>

                {!isDeveloper && (
                    <TabsContent value="brain" className="animate-in fade-in slide-in-from-right-8 duration-700 w-full overflow-hidden">
                        <LLMKeySettings />
                    </TabsContent>
                )}
            </Tabs>
        </main >
    )
}
