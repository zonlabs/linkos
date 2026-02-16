"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { useTheme } from "next-themes"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Logo } from "@/components/ui/logo"
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuGroup,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger
} from "@/components/ui/dropdown-menu"
import {
    LogOut,
    Settings,
    User,
    Sun,
    Moon,
    ChevronDown,
    Shield,
    Zap,
    LayoutDashboard,
    Github
} from "lucide-react"

export function Header() {
    const pathname = usePathname()
    const router = useRouter()
    const { theme, setTheme } = useTheme()
    const [user, setUser] = useState<any>(null)
    const [loading, setLoading] = useState(true)
    const [isDeveloper, setIsDeveloper] = useState(false)
    const [mounted, setMounted] = useState(false)
    const supabase = createClient()

    const isAuthPage = pathname === "/login" || pathname === "/signup"
    const isDashboard = pathname.startsWith("/dashboard")

    useEffect(() => {
        setMounted(true)
        async function getSession() {
            const { data: { user } } = await supabase.auth.getUser()
            setUser(user)
            if (user?.email?.includes('admin') || user?.user_metadata?.is_developer) {
                setIsDeveloper(true)
            }
            setLoading(false)
        }
        getSession()
    }, [])

    const handleSignOut = async () => {
        await supabase.auth.signOut()
        router.refresh()
        router.push('/')
    }

    const toggleMode = async () => {
        const newMode = !isDeveloper
        setIsDeveloper(newMode)
        await supabase.auth.updateUser({
            data: { is_developer: newMode }
        })
        router.refresh()
    }

    if (isAuthPage) {
        return (
            <header className="px-4 lg:px-6 h-16 flex items-center justify-center border-b border-border bg-background/50 backdrop-blur-xl sticky top-0 z-50">
                <Logo />
            </header>
        )
    }

    return (
        <>
            <div className="bg-zinc-900 border-b border-white/5 px-4 py-2 flex items-center justify-center text-[10px] font-medium text-zinc-400 gap-2">
                <Github className="h-3 w-3" />
                <span>
                    Beta Preview — Linkos is currently in beta. Please report any issues or feedback on our <Link href="https://github.com/zonlabs/linkos" className="font-bold underline text-zinc-200 hover:text-white" target="_blank">GitHub repository</Link>.
                </span>
            </div>
            <header className="px-4 lg:px-6 h-16 flex items-center border-b border-border bg-background/50 backdrop-blur-xl sticky top-0 z-50 transition-colors duration-500">
                <div className="max-w-4xl mx-auto w-full flex items-center justify-between">
                    <Logo />

                    <nav className="flex gap-4 items-center">
                        {mounted && (
                            <Button
                                variant="ghost"
                                size="icon"
                                className="rounded-full h-9 w-9 bg-background/50 border border-border/50 hover:bg-accent transition-colors"
                                onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
                            >
                                <Sun className="h-[1.1rem] w-[1.1rem] rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0 text-foreground" />
                                <Moon className="absolute h-[1.1rem] w-[1.1rem] rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100 text-foreground" />
                                <span className="sr-only">Toggle theme</span>
                            </Button>
                        )}

                        {loading ? null : user ? (
                            <div className="flex items-center gap-4">
                                <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                        <Button variant="ghost" className="h-10 px-4 rounded-full border border-border bg-background/40 hover:bg-accent transition-all flex items-center gap-3">
                                            <div className="hidden sm:block text-right">
                                                <p className="text-[10px] font-black uppercase tracking-widest leading-none">
                                                    {user?.email?.split('@')[0]}
                                                </p>
                                                <p className="text-[9px] text-muted-foreground font-bold uppercase tracking-widest mt-1">
                                                    PRO ACCOUNT
                                                </p>
                                            </div>
                                            <div className="h-7 w-7 rounded-full bg-linear-to-br from-primary/20 to-primary/10 border border-primary/20 flex items-center justify-center overflow-hidden">
                                                {user?.user_metadata?.avatar_url ? (
                                                    <img src={user.user_metadata.avatar_url} alt="Profile" className="h-full w-full object-cover" />
                                                ) : (
                                                    <User className="h-4 w-4 text-primary" />
                                                )}
                                            </div>
                                            <ChevronDown className="h-3 w-3 text-muted-foreground" />
                                        </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent className="w-64 rounded-xl p-2 bg-background border border-border shadow-none mt-2 overflow-hidden" align="end">
                                        <DropdownMenuLabel className="px-3 py-4">
                                            <div className="flex flex-col gap-1">
                                                <p className="text-xs font-black uppercase tracking-widest leading-none">Account Context</p>
                                                <p className="text-[10px] text-muted-foreground font-medium truncate">{user?.email}</p>
                                            </div>
                                        </DropdownMenuLabel>
                                        <DropdownMenuSeparator className="bg-border/10" />
                                        <DropdownMenuGroup className="p-1">
                                            <DropdownMenuItem className="rounded-xl focus:bg-accent cursor-pointer py-2.5 px-3" onClick={() => router.push('/dashboard')}>
                                                <LayoutDashboard className="h-4 w-4 mr-2" />
                                                <span className="text-xs font-bold uppercase tracking-widest">Workspace</span>
                                            </DropdownMenuItem>
                                            <DropdownMenuItem className="rounded-xl focus:bg-accent cursor-pointer py-2.5 px-3" onClick={toggleMode}>
                                                <Shield className="h-4 w-4 mr-2 text-primary" />
                                                <div className="flex flex-col">
                                                    <span className="text-xs font-bold uppercase tracking-widest">{isDeveloper ? 'Advanced Mode' : 'Basic Mode'}</span>
                                                    <span className="text-[9px] text-muted-foreground font-bold uppercase tracking-tight mt-0.5">Switch to {isDeveloper ? 'Basic' : 'Advanced'}</span>
                                                </div>
                                            </DropdownMenuItem>
                                        </DropdownMenuGroup>
                                        <DropdownMenuSeparator className="bg-border/10" />
                                        <DropdownMenuItem className="rounded-xl focus:bg-red-500/10 text-red-500 focus:text-red-500 cursor-pointer py-2.5 px-3" onClick={handleSignOut}>
                                            <LogOut className="h-4 w-4 mr-2" />
                                            <span className="text-xs font-bold uppercase tracking-widest">Terminate Session</span>
                                        </DropdownMenuItem>
                                    </DropdownMenuContent>
                                </DropdownMenu>
                            </div>
                        ) : (
                            <div className="flex items-center gap-4">
                                <Link className="text-[10px] font-black uppercase tracking-widest hover:text-primary transition-colors" href="/login">
                                    Sign In
                                </Link>
                                <Button size="sm" className="rounded-xl font-bold uppercase tracking-wider text-[10px] shadow-[0_4px_10px_rgba(var(--primary),0.2)]" asChild>
                                    <Link href="/signup">Get Started</Link>
                                </Button>
                            </div>
                        )}
                    </nav>
                </div>
            </header>
        </>
    )
}
