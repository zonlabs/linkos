"use client"

import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import { Loader2, Plus, MessageSquare, Bot, Power, Trash2, Command, LogOut, Settings, LayoutDashboard } from "lucide-react"

export default function DashboardPage() {
    const [user, setUser] = useState<any>(null)
    const [loading, setLoading] = useState(true)
    const [connections, setConnections] = useState<any[]>([])

    // Form states
    const [botToken, setBotToken] = useState("your token")
    const [agentUrl, setAgentUrl] = useState("http://127.0.0.1:8001/agent")
    const [platform, setPlatform] = useState("telegram")
    const [adding, setAdding] = useState(false)

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

            try {
                const response = await fetch("/api/connections")
                if (response.ok) {
                    const data = await response.json()
                    setConnections(data)
                } else {
                    throw new Error("Failed to fetch connections")
                }
            } catch (err) {
                console.error("Fetch failed", err)
                setConnections([])
            }

            setLoading(false)
        }
        fetchData()
    }, [])

    const handleSignOut = async () => {
        await supabase.auth.signOut()
        router.refresh()
        router.push('/login')
    }

    const handleAddConnection = async (e: React.FormEvent) => {
        e.preventDefault()
        setAdding(true)

        try {
            const response = await fetch("/api/connections", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    platform,
                    token: botToken,
                    agent_url: agentUrl,
                }),
            })

            if (!response.ok) {
                const error = await response.json()
                throw new Error(error.error || "Failed to deploy gateway")
            }

            const newConn = await response.json()
            setConnections([newConn, ...connections])
            setBotToken("")
            setAgentUrl("")
            setAdding(false)
        } catch (err: any) {
            alert(err.message)
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
        }
    }

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-screen bg-black">
                <Loader2 className="h-8 w-8 animate-spin text-zinc-400" />
            </div>
        )
    }

    return (
        <div className="min-h-screen bg-black text-zinc-100">
            {/* Sidebar/Mobile Nav placeholder */}
            <nav className="border-b border-zinc-900 bg-black/50 backdrop-blur-xl sticky top-0 z-50">
                <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
                    <div className="flex items-center gap-6">
                        <div className="flex items-center gap-2 font-bold text-lg tracking-tight">
                            <div className="rounded bg-white p-1">
                                <Command className="h-4 w-4 text-black" />
                            </div>
                            Linkos <span className="text-zinc-500 font-medium">SaaS</span>
                        </div>
                        <div className="hidden md:flex items-center gap-1 text-sm font-medium">
                            <Button variant="ghost" className="text-zinc-100 gap-2">
                                <LayoutDashboard className="h-4 w-4" /> Dashboard
                            </Button>
                            <Button variant="ghost" className="text-zinc-400 hover:text-zinc-100 gap-2">
                                <Settings className="h-4 w-4" /> Settings
                            </Button>
                        </div>
                    </div>
                    <div className="flex items-center gap-3">
                        <div className="hidden sm:block text-right">
                            <p className="text-xs font-medium text-zinc-200">{user?.email}</p>
                            <p className="text-[10px] text-zinc-500 capitalize">Pro Plan</p>
                        </div>
                        <Button variant="ghost" size="icon" className="text-zinc-400 hover:text-white" onClick={handleSignOut}>
                            <LogOut className="h-4 w-4" />
                        </Button>
                    </div>
                </div>
            </nav>

            <main className="max-w-7xl mx-auto p-4 md:p-8 space-y-8">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight">Welcome back</h1>
                    <p className="text-zinc-400 text-sm">Monitor and manage your agent gateways across platforms.</p>
                </div>

                <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
                    <TabsList className="bg-zinc-900 border border-zinc-800 p-1">
                        <TabsTrigger value="connections" className="data-[state=active]:bg-zinc-800">Connections</TabsTrigger>
                        <TabsTrigger value="add" className="data-[state=active]:bg-zinc-800">Add Connection</TabsTrigger>
                    </TabsList>

                    <TabsContent value="connections" className="space-y-6">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <Card className="bg-zinc-900/40 border-zinc-800 text-zinc-100 overflow-hidden relative">
                                <CardHeader className="pb-2">
                                    <CardDescription className="text-zinc-500 text-xs font-semibold uppercase tracking-wider">Active Proxies</CardDescription>
                                    <CardTitle className="text-3xl font-bold">{connections.filter(c => c.status === 'active').length}</CardTitle>
                                </CardHeader>
                                <div className="absolute top-0 right-0 p-4 opacity-10">
                                    <Bot className="h-12 w-12" />
                                </div>
                            </Card>
                            <Card className="bg-zinc-900/40 border-zinc-800 text-zinc-100 overflow-hidden relative">
                                <CardHeader className="pb-2">
                                    <CardDescription className="text-zinc-500 text-xs font-semibold uppercase tracking-wider">Total Tunnels</CardDescription>
                                    <CardTitle className="text-3xl font-bold">{connections.length}</CardTitle>
                                </CardHeader>
                                <div className="absolute top-0 right-0 p-4 opacity-10">
                                    <Plus className="h-12 w-12" />
                                </div>
                            </Card>
                            <Card className="bg-zinc-900/40 border-zinc-800 text-zinc-100 overflow-hidden relative">
                                <CardHeader className="pb-2">
                                    <CardDescription className="text-zinc-500 text-xs font-semibold uppercase tracking-wider">Hub Status</CardDescription>
                                    <CardTitle className="text-2xl text-zinc-100 flex items-center gap-2">
                                        Running <div className="h-2 w-2 rounded-full bg-white animate-pulse" />
                                    </CardTitle>
                                </CardHeader>
                                <div className="absolute top-0 right-0 p-4 opacity-10">
                                    <Power className="h-12 w-12" />
                                </div>
                            </Card>
                        </div>

                        <Card className="bg-zinc-900/40 border-zinc-800 text-zinc-100">
                            <CardHeader className="flex flex-row items-center justify-between space-y-0">
                                <div>
                                    <CardTitle className="text-lg">Gateway Connections</CardTitle>
                                    <CardDescription className="text-zinc-500 text-sm">Your active bot-to-agent tunnels.</CardDescription>
                                </div>
                                <Button size="sm" className="bg-white text-black hover:bg-zinc-200" onClick={() => setActiveTab("add")}>
                                    <Plus className="h-4 w-4 mr-2" /> New Connection
                                </Button>
                            </CardHeader>
                            <CardContent>
                                <Table>
                                    <TableHeader className="border-zinc-800">
                                        <TableRow className="hover:bg-transparent border-zinc-800">
                                            <TableHead className="text-zinc-500 text-xs uppercase">Platform</TableHead>
                                            <TableHead className="text-zinc-500 text-xs uppercase">Identity</TableHead>
                                            <TableHead className="text-zinc-500 text-xs uppercase">Agent Endpoint</TableHead>
                                            <TableHead className="text-zinc-500 text-xs uppercase">Health</TableHead>
                                            <TableHead className="text-right text-zinc-500 text-xs uppercase">Manage</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {connections.length === 0 ? (
                                            <TableRow>
                                                <TableCell colSpan={5} className="text-center py-10 text-zinc-500 italic">No active connections found.</TableCell>
                                            </TableRow>
                                        ) : connections.map((conn) => (
                                            <TableRow key={conn.id} className="border-zinc-800/50 hover:bg-zinc-800/30 transition-colors group">
                                                <TableCell className="font-medium">
                                                    <div className="flex items-center gap-2 capitalize">
                                                        {conn.platform === 'telegram' ? <MessageSquare className="h-3.5 w-3.5 text-zinc-400" /> :
                                                            conn.platform === 'whatsapp' ? <Bot className="h-3.5 w-3.5 text-zinc-400" /> :
                                                                <Bot className="h-3.5 w-3.5 text-zinc-400" />}
                                                        {conn.platform}
                                                    </div>
                                                </TableCell>
                                                <TableCell className="text-sm">{conn.name || 'Anonymous Bot'}</TableCell>
                                                <TableCell>
                                                    <code className="text-[10px] bg-black border border-zinc-800 px-1.5 py-0.5 rounded text-zinc-400 group-hover:text-zinc-200 transition-colors">
                                                        {conn.agent_url}
                                                    </code>
                                                </TableCell>
                                                <TableCell>
                                                    <div className="flex items-center gap-2">
                                                        <Badge variant="outline"
                                                            className={conn.status === 'active' ? 'bg-white/10 text-white border-white/20' : 'bg-zinc-800 text-zinc-500 border-zinc-700'}>
                                                            <div className={`h-1.5 w-1.5 rounded-full mr-1.5 ${conn.status === 'active' ? 'bg-white' : 'bg-zinc-500'}`} />
                                                            {conn.status}
                                                        </Badge>
                                                    </div>
                                                </TableCell>
                                                <TableCell className="text-right space-x-1">
                                                    <Button variant="ghost" size="icon" className="h-8 w-8 text-zinc-500 hover:text-zinc-100 hover:bg-zinc-800">
                                                        <Settings className="h-3.5 w-3.5" />
                                                    </Button>
                                                    <Button variant="ghost" size="icon" className="h-8 w-8 text-zinc-500 hover:text-white hover:bg-white/10" onClick={() => handleDeleteConnection(conn.id)}>
                                                        <Trash2 className="h-3.5 w-3.5" />
                                                    </Button>
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </CardContent>
                        </Card>
                    </TabsContent>

                    <TabsContent value="add">
                        <Card className="bg-zinc-900/40 border-zinc-800 text-zinc-100 max-w-2xl border-t-2 border-t-white">
                            <CardHeader>
                                <CardTitle className="text-xl">Initialize Gateway</CardTitle>
                                <CardDescription className="text-zinc-500">
                                    Securely route a messaging platform to your remote agent.
                                </CardDescription>
                            </CardHeader>
                            <form onSubmit={handleAddConnection}>
                                <CardContent className="space-y-6">
                                    <div className="space-y-3">
                                        <label className="text-sm font-semibold text-zinc-300">Target Platform</label>
                                        <div className="flex gap-3">
                                            <Button
                                                type="button"
                                                variant={platform === 'telegram' ? 'default' : 'outline'}
                                                className={platform === 'telegram' ? 'bg-white text-black px-6' : 'border-zinc-800 text-zinc-400 hover:bg-zinc-800 px-6'}
                                                onClick={() => setPlatform('telegram')}
                                            >
                                                <MessageSquare className="h-4 w-4 mr-2" /> Telegram
                                            </Button>
                                            <Button
                                                type="button"
                                                variant={platform === 'whatsapp' ? 'default' : 'outline'}
                                                className={platform === 'whatsapp' ? 'bg-white text-black px-6' : 'border-zinc-800 text-zinc-400 hover:bg-zinc-800 px-6'}
                                                onClick={() => setPlatform('whatsapp')}
                                            >
                                                <Bot className="h-4 w-4 mr-2" /> WhatsApp
                                            </Button>
                                            <Button
                                                type="button"
                                                variant={platform === 'discord' ? 'default' : 'outline'}
                                                className={platform === 'discord' ? 'bg-white text-black px-6' : 'border-zinc-800 text-zinc-400 hover:bg-zinc-800 px-6'}
                                                onClick={() => setPlatform('discord')}
                                            >
                                                <Bot className="h-4 w-4 mr-2" /> Discord
                                            </Button>
                                        </div>
                                    </div>

                                    <div className="space-y-3">
                                        <label htmlFor="token" className="text-sm font-semibold text-zinc-300">Bot Secret Token</label>
                                        <Input
                                            id="token"
                                            type="password"
                                            placeholder="e.g. 123456789:ABCDef..."
                                            className="bg-black border-zinc-800 focus:border-zinc-600"
                                            value={botToken}
                                            onChange={(e) => setBotToken(e.target.value)}
                                            required
                                        />
                                        <p className="text-[10px] text-zinc-500 flex items-center gap-1 italic">
                                            <Power className="h-2.5 w-2.5" /> {platform === 'whatsapp' ? 'For WhatsApp, this can be your session name. You will need to scan QR code in Hub terminal.' : 'Linkos Hub will use this to establish the long-poll connection.'}
                                        </p>
                                    </div>

                                    <div className="space-y-3">
                                        <label htmlFor="url" className="text-sm font-semibold text-zinc-300">Remote Agent URL (AG-UI)</label>
                                        <Input
                                            id="url"
                                            placeholder="https://your-agent.com/agent"
                                            className="bg-black border-zinc-800 focus:border-zinc-600"
                                            value={agentUrl}
                                            onChange={(e) => setAgentUrl(e.target.value)}
                                            required
                                        />
                                        <p className="text-[10px] text-zinc-500 italic">Messages will be tunneled to this endpoint via streaming AG-UI protocol.</p>
                                    </div>
                                </CardContent>
                                <CardHeader className="pt-0">
                                    <Button className="w-full bg-white text-black hover:bg-zinc-200 h-10 font-bold" disabled={adding}>
                                        {adding && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                        Deploy Gateway
                                    </Button>
                                </CardHeader>
                            </form>
                        </Card>
                    </TabsContent>
                </Tabs>
            </main>
        </div>
    )
}
