"use client"

import { useEffect, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { Progress } from "./ui/progress"
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card"
import { Activity, AlertTriangle, ShieldCheck } from "lucide-react"

export default function UsageStats() {
    const [usage, setUsage] = useState(0)
    const [limit, setLimit] = useState(50)
    const [tier, setTier] = useState<string>('free') // Default to free
    const [loading, setLoading] = useState(true)
    const supabase = createClient()

    useEffect(() => {
        async function fetchStats() {
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) return

            // 1. Get Settings (Limit & Tier)
            const { data: settings } = await supabase
                .from('user_settings')
                .select('daily_request_limit, tier')
                .eq('user_id', user.id)
                .maybeSingle()

            if (settings) {
                if (settings.daily_request_limit) setLimit(settings.daily_request_limit)
                if (settings.tier) setTier(settings.tier)
            }

            // 2. Get Usage
            const today = new Date().toISOString().split('T')[0]
            const { data: usageData } = await supabase
                .from('user_daily_usage')
                .select('request_count')
                .eq('user_id', user.id)
                .eq('date', today)
                .maybeSingle()

            if (usageData) {
                setUsage(usageData.request_count)
            }
            setLoading(false)
        }
        fetchStats()
    }, [])

    if (loading) return null

    const percentage = Math.min((usage / limit) * 100, 100)
    const isCrisis = percentage >= 90
    const isWarning = percentage >= 75

    return (
        <Card className="border-none shadow-none bg-transparent">
            <CardHeader className="p-0 pb-2">
                <div className="flex items-center justify-between">
                    <CardTitle className="text-sm font-medium text-zinc-500 uppercase tracking-widest flex items-center gap-2">
                        <Activity className="h-4 w-4" /> Daily Usage
                    </CardTitle>
                    {/* Tier Badge */}
                    <div className={`text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full border ${tier === 'pro'
                        ? 'bg-purple-500/10 text-purple-600 border-purple-500/20 dark:text-purple-400'
                        : 'bg-zinc-100 text-zinc-500 border-zinc-200 dark:bg-white/10 dark:text-zinc-400 dark:border-white/10'
                        }`}>
                        {tier} Plan
                    </div>
                </div>
            </CardHeader>
            <CardContent className="p-0 space-y-3">
                <div className="flex items-end justify-between">
                    <div>
                        <span className="text-2xl font-black font-mono">{usage}</span>
                        <span className="text-zinc-400 text-xs font-medium ml-1">/ {limit} reqs</span>
                    </div>
                    {isCrisis ? (
                        <div className="flex items-center gap-1 text-red-500 text-[10px] uppercase font-bold tracking-wider animate-pulse">
                            <AlertTriangle className="h-3 w-3" /> Limit Reached
                        </div>
                    ) : (
                        <div className="flex items-center gap-1 text-green-500 text-[10px] uppercase font-bold tracking-wider">
                            <ShieldCheck className="h-3 w-3" /> Active
                        </div>
                    )}
                </div>

                <Progress
                    value={percentage}
                    className={`h-2 ${isCrisis ? 'bg-red-100 dark:bg-red-900/20' : 'bg-zinc-100 dark:bg-white/10'}`}
                // We need to style the indicator via CSS module or generic class if api allows, 
                // but shadcn Progress usually uses a primary color. 
                // We can override by wrapping or inline style if needed, 
                // but standard implementation is cleaner.
                />

                <p className="text-[10px] text-zinc-400">
                    Resets at 00:00 UTC. Upgrade plan for higher limits.
                </p>
            </CardContent>
        </Card>
    )
}
