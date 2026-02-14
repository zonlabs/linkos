"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Loader2, Command, CheckCircle2 } from "lucide-react"

export default function SignupPage() {
    const [email, setEmail] = useState("")
    const [password, setPassword] = useState("")
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [success, setSuccess] = useState(false)
    // const router = useRouter() // Removed as it's no longer used
    const supabase = createClient()

    const handleSignup = async (e: React.FormEvent) => {
        e.preventDefault()
        setLoading(true)
        setError(null)

        try {
            const { error } = await supabase.auth.signUp({
                email,
                password,
                options: {
                    emailRedirectTo: `${window.location.origin}/auth/callback`,
                },
            })

            if (error) {
                setError(error.message)
            } else {
                setSuccess(true)
            }
        } catch (err: any) {
            setError("An unexpected error occurred.")
        } finally {
            setLoading(false)
        }
    }

    if (success) {
        return (
            <div className="flex min-h-screen flex-col items-center justify-center bg-black p-4">
                <div className="mx-auto flex w-full flex-col justify-center space-y-6 sm:w-[350px] text-center">
                    <div className="flex justify-center mb-4">
                        <div className="rounded-full bg-zinc-900 p-3 border border-zinc-100/50">
                            <CheckCircle2 className="h-10 w-10 text-white" />
                        </div>
                    </div>
                    <h1 className="text-2xl font-semibold tracking-tight text-white">Check your email</h1>
                    <p className="text-sm text-zinc-400">
                        We&apos;ve sent a confirmation link to <span className="text-zinc-200 font-medium">{email}</span>. Please check your inbox to activate your account.
                    </p>
                    <Button variant="outline" className="mt-4 border-zinc-800 text-zinc-300 hover:bg-zinc-900 hover:text-white" asChild>
                        <Link href="/login">Back to Sign In</Link>
                    </Button>
                </div>
            </div>
        )
    }

    return (
        <div className="flex min-h-screen flex-col items-center justify-center bg-black p-4 lg:p-8">
            <div className="mx-auto flex w-full flex-col justify-center space-y-6 sm:w-[350px]">
                <div className="flex flex-col space-y-2 text-center">
                    <div className="flex justify-center mb-4">
                        <div className="rounded-lg bg-zinc-900 p-2 border border-zinc-800">
                            <Command className="h-6 w-6 text-white" />
                        </div>
                    </div>
                    <h1 className="text-2xl font-semibold tracking-tight text-white">Create an account</h1>
                    <p className="text-sm text-zinc-400">
                        Join Linkos and start connecting your agents to the world
                    </p>
                </div>

                <div className="grid gap-6">
                    <form onSubmit={handleSignup}>
                        <div className="grid gap-4">
                            {error && (
                                <Alert variant="destructive" className="bg-zinc-950 border-zinc-800 text-zinc-100">
                                    <AlertDescription>{error}</AlertDescription>
                                </Alert>
                            )}
                            <div className="grid gap-2">
                                <Label htmlFor="email" className="text-zinc-300">Email</Label>
                                <Input
                                    id="email"
                                    type="email"
                                    placeholder="name@example.com"
                                    disabled={loading}
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    className="bg-black border-zinc-800 text-white placeholder:text-zinc-600 focus:border-zinc-700 transition-colors h-11"
                                    required
                                />
                            </div>
                            <div className="grid gap-2">
                                <Label htmlFor="password" title="Password" className="text-zinc-300">Password</Label>
                                <Input
                                    id="password"
                                    type="password"
                                    disabled={loading}
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    className="bg-black border-zinc-800 text-white focus:border-zinc-700 transition-colors h-11"
                                    required
                                />
                            </div>
                            <Button disabled={loading} className="mt-2 bg-white text-black hover:bg-zinc-200 h-11 font-bold">
                                {loading && (
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                )}
                                Get Started
                            </Button>
                        </div>
                    </form>
                </div>

                <p className="px-8 text-center text-sm text-zinc-500">
                    <Link
                        href="/login"
                        className="hover:text-white underline underline-offset-4 transition-colors"
                    >
                        Already have an account? Sign In
                    </Link>
                </p>
            </div>
        </div>
    )
}
