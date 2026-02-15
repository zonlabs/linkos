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
import { Loader2, Plus, Bot, Power, Trash2, ChevronRight, Settings, Shield, ArrowRight } from "lucide-react"
import { QRCodeSVG } from "qrcode.react"
import { Header } from "@/components/layout/header"
import { toast } from "sonner"

export default function DashboardPage() {
    const [user, setUser] = useState<any>(null)
    const [loading, setLoading] = useState(true)
    const [connections, setConnections] = useState<any[]>([])
    const [isDeveloper, setIsDeveloper] = useState(false)

    // Form states
    const [botToken, setBotToken] = useState("")
    const [agentUrl, setAgentUrl] = useState("http://127.0.0.1:8001/agent")
    const [platform, setPlatform] = useState("telegram")
    const [adding, setAdding] = useState(false)

    // QR & Status states
    const [showQR, setShowQR] = useState(false)
    const [currentQR, setCurrentQR] = useState<string | null>(null)
    const [pendingConnId, setPendingConnId] = useState<string | null>(null)
    const [connStatus, setConnStatus] = useState<string>("initializing")

    const [activeTab, setActiveTab] = useState("connections")

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
        if (!pendingConnId || !showQR) return

        let pollInterval: NodeJS.Timeout

        const checkStatus = async () => {
            try {
                const res = await fetch(`/api/connections/${pendingConnId}/status`)
                if (res.ok) {
                    const data = await res.json()
                    // If we have a QR code, show it
                    if (data.type === 'qr' && data.data) {
                        setCurrentQR(data.data)
                        setConnStatus('qr')
                    }
                    // If connected, close modal
                    if (data.type === 'connected' || data.status === 'connected') {
                        setConnStatus('connected')
                        setTimeout(() => {
                            setShowQR(false)
                            setPendingConnId(null)
                            toast.success("WhatsApp connected successfully!")
                        }, 1000)
                    }
                }
            } catch (err) {
                console.error("Poll failed", err)
            }
        }

        // Check immediately
        checkStatus()

        // Then poll every 2 seconds
        pollInterval = setInterval(checkStatus, 2000)

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
                    platform,
                    token: platform === 'whatsapp' ? 'wa-session' : botToken,
                    userId: user?.id,
                    agentUrl: isDeveloper ? agentUrl : "http://127.0.0.1:8001/agent",
                }),
            })

            if (!response.ok) {
                const error = await response.json()
                throw new Error(error.error || "Failed to deploy gateway")
            }

            const newConn = await response.json()
            setConnections([newConn, ...connections])

            if (platform === 'whatsapp') {
                setPendingConnId(newConn.id)
                setShowQR(true)
            } else {
                setBotToken("")
                setActiveTab("connections")
            }
            setAdding(false)
        } catch (err: any) {
            toast.error("Failed to deploy gateway. Please check your token and try again.")
            setAdding(false)
        }
    }

    const handleDeleteConnection = async (id: string) => {
        try {
            const response = await fetch(`/api/connections?id=${id}`, {
                method: "DELETE",
            })
            if (response.ok) {
                setConnections(connections.filter(c => c.id !== id))
            }
        } catch (err) {
            console.error("Delete failed", err)
            toast.error("Failed to delete connection. Please try again.")
        }
    }

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-screen bg-background text-foreground transition-colors duration-500">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
        )
    }

    const PlatformIcon = ({ platform }: { platform: string }) => {
        return <Image src={`/platforms/${platform}.svg`} width={16} height={16} className="h-4 w-4" alt={platform} />
    }

    return (
        <div className="min-h-screen bg-background text-foreground transition-colors duration-500">
            {/* QR Modal */}
            {showQR && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in duration-300">
                    <Card className="bg-background border-border w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-300 relative shadow-2xl">
                        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-white/40 to-transparent" />
                        <CardHeader className="text-center pt-6 pb-2 px-10">
                            <div className="mx-auto w-16 h-16 bg-white rounded-2xl flex items-center justify-center mb-4 shadow-[0_0_20px_rgba(255,255,255,0.3)] animate-bounce">
                                <Image src="/platforms/whatsapp.svg" width={32} height={32} className="h-8 w-8" alt="WA" />
                            </div>
                            <CardTitle className="text-2xl font-black tracking-tight uppercase italic text-gradient-premium">Scan QR Code</CardTitle>
                            <CardDescription className="text-zinc-500 font-medium px-4">
                                Open WhatsApp on your phone and scan to connect.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="flex flex-col items-center justify-center pb-6 px-10 space-y-6">
                            <div className="relative group">
                                <div className="absolute -inset-4 bg-white/5 rounded-[2rem] blur-2xl group-hover:bg-white/10 transition-all duration-700" />
                                <div className="relative p-0 bg-white rounded-[2rem]">
                                    {connStatus === 'qr' && currentQR ? (
                                        <div className="bg-white p-2 rounded-xl">
                                            <QRCodeSVG value={currentQR} size={200} level="H" />
                                        </div>
                                    ) : (
                                        <div className="h-[200px] w-[200px] bg-zinc-200 dark:bg-zinc-800 rounded-xl animate-pulse" />
                                    )}
                                </div>
                            </div>

                            <div className="w-full space-y-4">


                                <Button
                                    className="w-full bg-white text-black hover:bg-zinc-200 h-12 rounded-xl font-bold text-xs uppercase tracking-widest transition-all active:scale-95"
                                    onClick={() => {
                                        setShowQR(false)
                                        setActiveTab("connections")
                                    }}
                                >
                                    {connStatus === 'connected' ? 'Finish Setup' : 'Cancel Setup'}
                                </Button>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            )}

            <Header />


            <main className="max-w-4xl mx-auto p-4 md:p-8 space-y-12 animate-in fade-in slide-in-from-bottom-8 duration-1000">

                <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500 mb-8">
                    <span
                        className={activeTab === 'connections' ? 'text-zinc-900 dark:text-white cursor-default' : 'hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors cursor-pointer'}
                        onClick={() => activeTab !== 'connections' && setActiveTab('connections')}
                    >
                        Connections
                    </span>
                    {activeTab === 'add' && (
                        <>
                            <ChevronRight className="h-3 w-3" />
                            <span className="text-zinc-900 dark:text-white animate-in fade-in slide-in-from-left-2">
                                New Gateway
                            </span>
                        </>
                    )}
                </div>

                <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">


                    <TabsContent value="connections" className="space-y-10 animate-in fade-in zoom-in-95 duration-500">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                            <div className="p-6 rounded-2xl bg-zinc-50 dark:bg-white/5 border border-zinc-100 dark:border-white/5 relative group overflow-hidden">
                                <div className="space-y-1 relative z-10">
                                    <span className="text-zinc-500 text-[10px] font-bold uppercase tracking-[0.2em]">Active Proxies</span>
                                    <div className="text-4xl font-black font-mono tracking-tighter text-zinc-900 dark:text-white">
                                        {connections.filter(c => c.status === 'active').length}
                                    </div>
                                </div>
                                <div className="absolute top-0 right-0 p-6 opacity-10 dark:opacity-5 group-hover:opacity-20 transition-all duration-700 group-hover:scale-110 group-hover:-rotate-12">
                                    <Bot className="h-12 w-12 text-zinc-900 dark:text-white" />
                                </div>
                            </div>
                            <div className="p-6 rounded-2xl bg-zinc-50 dark:bg-white/5 border border-zinc-100 dark:border-white/5 relative group overflow-hidden">
                                <div className="space-y-1 relative z-10">
                                    <span className="text-zinc-500 text-[10px] font-bold uppercase tracking-[0.2em]">Total Tunnels</span>
                                    <div className="text-4xl font-black font-mono tracking-tighter text-zinc-900 dark:text-white">{connections.length}</div>
                                </div>
                                <div className="absolute top-0 right-0 p-6 opacity-10 dark:opacity-5 group-hover:opacity-20 transition-all duration-700 group-hover:scale-110 group-hover:-rotate-12">
                                    <Plus className="h-12 w-12 text-zinc-900 dark:text-white" />
                                </div>
                            </div>
                            <div className="p-6 rounded-2xl bg-zinc-50 dark:bg-white/5 border border-zinc-100 dark:border-white/5 relative group overflow-hidden">
                                <div className="space-y-1 relative z-10">
                                    <span className="text-zinc-500 text-[10px] font-bold uppercase tracking-[0.2em]">Hub Status</span>
                                    <div className="text-xl font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-3">
                                        ONLINE <div className="h-2.5 w-2.5 rounded-full bg-green-500 animate-pulse shadow-[0_0_15px_rgba(34,197,94,0.6)]" />
                                    </div>
                                </div>
                                <div className="absolute top-0 right-0 p-6 opacity-10 dark:opacity-5 group-hover:opacity-20 transition-all duration-700 group-hover:scale-110 group-hover:-rotate-12">
                                    <Power className="h-12 w-12 text-zinc-900 dark:text-white" />
                                </div>
                            </div>
                        </div>

                        <div className="space-y-6">
                            <div className="flex flex-row items-center justify-between px-2">
                                <div>
                                    <h3 className="text-xl font-bold tracking-tight text-zinc-900 dark:text-white">Gateway Connections</h3>
                                    <p className="text-zinc-500 text-xs font-medium mt-1">Global messenger-to-agent streaming tunnels.</p>
                                </div>
                                <Button size="sm" className="bg-zinc-900 dark:bg-white text-white dark:text-black hover:bg-zinc-800 dark:hover:bg-zinc-200 rounded-full h-10 px-6 font-black text-[10px] uppercase tracking-widest transition-all hover:scale-105 shadow-none" onClick={() => setActiveTab("add")}>
                                    <Plus className="h-3.5 w-3.5 mr-2" /> Deploy New
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
                                        {connections.length === 0 ? (
                                            <TableRow className="border-zinc-200 dark:border-white/5">
                                                <TableCell colSpan={5} className="text-center py-10 text-zinc-500 italic">No active connections found.</TableCell>
                                            </TableRow>
                                        ) : connections.map((conn) => (
                                            <TableRow key={conn.id} className="border-zinc-200 dark:border-white/5 hover:bg-zinc-50 dark:hover:bg-white/5 transition-colors group">
                                                <TableCell className="font-medium">
                                                    <div className="flex items-center gap-3 capitalize bg-zinc-100 dark:bg-white/10 w-fit px-3 py-1 rounded-full border border-zinc-200 dark:border-white/5">
                                                        <PlatformIcon platform={conn.platform} />
                                                        <span className="text-xs text-zinc-900 dark:text-zinc-100">{conn.platform}</span>
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
                                                            className={conn.status === 'active' || conn.status === 'connected' ? 'bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20' : conn.status === 'initializing' || conn.status === 'qr' ? 'bg-yellow-500/10 text-yellow-600 dark:text-yellow-500 border-yellow-500/20' : 'bg-red-500/10 text-red-600 dark:text-red-500 border-red-500/20'}>
                                                            <div className={`h-1.5 w-1.5 rounded-full mr-1.5 animate-pulse ${conn.status === 'active' || conn.status === 'connected' ? 'bg-green-500' : 'bg-yellow-500'}`} />
                                                            {conn.status}
                                                        </Badge>
                                                    </div>
                                                </TableCell>
                                                <TableCell className="text-right space-x-1">
                                                    <Button variant="ghost" size="icon" className="h-8 w-8 text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-white/10">
                                                        <Settings className="h-3.5 w-3.5" />
                                                    </Button>
                                                    <Button variant="ghost" size="icon" className="h-8 w-8 text-zinc-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-500/10" onClick={() => handleDeleteConnection(conn.id)}>
                                                        <Trash2 className="h-3.5 w-3.5" />
                                                    </Button>
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
                                <h2 className="text-2xl font-black tracking-tight uppercase italic text-gradient-premium">New Gateway</h2>
                                <p className="text-zinc-500 font-medium mt-1">
                                    Bridge your messenger platform to the remote agent.
                                </p>
                            </div>

                            <form onSubmit={handleAddConnection} className="relative z-10">
                                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-20">
                                    <div className="space-y-10">
                                        <div className="space-y-4">
                                            <label className="text-[10px] font-black uppercase tracking-[0.3em] text-zinc-500">Platform Protocol</label>
                                            <div className="grid grid-cols-3 gap-3 md:gap-6">
                                                {['telegram', 'whatsapp', 'discord'].map((p) => (
                                                    <button
                                                        key={p}
                                                        type="button"
                                                        className={`group relative flex flex-col items-center justify-center gap-4 p-3 rounded-xl border transition-all duration-500 overflow-hidden ${platform === p ? 'bg-primary/10 border-primary/40' : 'bg-muted/40 border-border/40 hover:border-primary/20 hover:bg-muted/60'}`}
                                                        onClick={() => setPlatform(p)}
                                                    >
                                                        <Image src={`/platforms/${p}.svg`} width={40} height={40} className={`h-10 w-10 transition-all duration-500 ${platform === p ? 'opacity-100 drop-shadow-lg' : 'opacity-50 group-hover:opacity-100'}`} alt={p} />
                                                        <span className={`text-[8px] md:text-[10px] font-black uppercase tracking-[0.2em] transition-all duration-500 ${platform === p ? 'text-foreground' : 'text-zinc-500 group-hover:text-zinc-700 dark:group-hover:text-zinc-300'}`}>{p}</span>
                                                    </button>
                                                ))}
                                            </div>
                                        </div>


                                    </div>

                                    <div className="space-y-10">
                                        {platform !== 'whatsapp' && (
                                            <div className="space-y-4 animate-in fade-in slide-in-from-top-4 duration-500">
                                                <label htmlFor="token" className="text-[10px] font-black uppercase tracking-[0.3em] text-zinc-500">Bot Secret Token</label>
                                                <Input
                                                    id="token"
                                                    type="password"
                                                    placeholder="e.g. 123456789:ABCDef..."
                                                    className="bg-zinc-100 dark:bg-black/40 border-zinc-200 dark:border-white/5 focus:border-zinc-400 dark:focus:border-white/20 h-12 rounded-xl text-xs text-foreground"
                                                    value={botToken}
                                                    onChange={(e) => setBotToken(e.target.value)}
                                                    required
                                                />
                                                <p className="text-[9px] text-zinc-600 font-bold uppercase tracking-widest flex items-center gap-2">
                                                    <Power className="h-3 w-3" /> Secure long-poll connection via Linkos Relay
                                                </p>
                                            </div>
                                        )}

                                        {platform === 'whatsapp' && (
                                            <div className="p-6 rounded-2xl bg-zinc-100 dark:bg-white/5 border border-zinc-200 dark:border-white/10 flex items-center gap-5 animate-in fade-in slide-in-from-top-4 duration-500">
                                                <Shield className="h-6 w-6 text-zinc-400 dark:text-white/40" />
                                                <div className="space-y-1">
                                                    <p className="text-xs font-black uppercase tracking-widest text-zinc-700 dark:text-white/80">Account Session</p>
                                                    <p className="text-[10px] text-zinc-500 font-medium leading-relaxed">WhatsApp uses end-to-end QR authentication.</p>
                                                </div>
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
                                                disabled={adding}
                                            >
                                                {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : (
                                                    <>
                                                        Deploy Gateway
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
                </Tabs>
            </main>
        </div>
    )
}
