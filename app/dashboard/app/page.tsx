"use client"

import { useState, useEffect } from "react"
import Link from "next/link";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Send, MessageCircle, MessageSquare, Layers, Zap, Globe, Shield, Command, ArrowRight, Github, Bot, User } from "lucide-react";
import { OrbitingCircles } from "@/components/ui/orbiting-circles";
import { Header } from "@/components/layout/header";

export default function Home() {
    const [mounted, setMounted] = useState(false)

    useEffect(() => {
        setMounted(true)
    }, [])

    if (!mounted) return null

    return (
        <div className="flex flex-col min-h-screen bg-background text-foreground transition-colors duration-500">
            <Header />

            <main className="flex-1">
                {/* Hero Section */}
                <section className="w-full pt-12 pb-20 md:pt-16 md:pb-24 lg:pt-20 lg:pb-32 flex justify-center border-b border-border overflow-hidden relative">
                    <div className="max-w-4xl mx-auto px-4 md:px-6 grid grid-cols-1 lg:grid-cols-2 gap-12 items-center relative z-10">
                        <div className="text-center lg:text-left space-y-8 animate-in fade-in slide-in-from-left-8 duration-1000 order-2 lg:order-1">
                            <div className="space-y-4">
                                <h1 className="text-4xl font-extrabold tracking-tighter sm:text-5xl md:text-6xl flex flex-col items-center lg:items-start text-balance">
                                    Connect your Agents to
                                    <span className="text-primary italic">Messaging Platforms.</span>
                                </h1>
                                <p className="mx-auto lg:mx-0 max-w-[600px] text-muted-foreground md:text-xl/relaxed lg:text-base/relaxed xl:text-xl/relaxed text-balance">
                                    A streaming gateway for connecting agents to messaging platforms.
                                    Support for Telegram, Discord, and WhatsApp.
                                </p>
                            </div>
                            <div className="flex flex-col sm:flex-row gap-4 justify-center lg:justify-start">
                                <Button size="lg" className="rounded-2xl font-bold uppercase tracking-widest px-8 group" asChild>
                                    <Link href="/signup">
                                        Start Building <Zap className="ml-2 h-4 w-4 fill-current group-hover:scale-125 transition-transform" />
                                    </Link>
                                </Button>
                                <Button size="lg" variant="outline" className="rounded-2xl font-bold uppercase tracking-widest border-border hover:bg-muted group" asChild>
                                    <Link href="/login">
                                        Live Demo <ArrowRight className="ml-2 h-4 w-4 group-hover:translate-x-1 transition-transform" />
                                    </Link>
                                </Button>
                            </div>
                        </div>

                        {/* Orbiting Circles Animation */}
                        <div className="relative flex h-[350px] w-full items-center justify-center overflow-hidden animate-in fade-in zoom-in duration-1000 delay-300 order-1 lg:order-2">
                            <div className="absolute inset-0 bg-linear-to-b from-primary/5 via-transparent to-transparent rounded-full blur-3xl" />

                            {/* Central Logo */}
                            <div className="z-10 flex h-20 w-20 items-center justify-center rounded-3xl bg-foreground shadow-2xl transition-transform hover:scale-110 duration-500">
                                <Command className="h-10 w-10 text-background" />
                            </div>

                            {/* Inner Circle */}
                            <OrbitingCircles
                                radius={80}
                                duration={20}
                                iconSize={50}
                                className="border-none bg-transparent"
                            >
                                <Image src="/platforms/telegram.svg" width={36} height={36} className="h-9 w-9" alt="Telegram" />
                                <Image src="/platforms/whatsapp.svg" width={36} height={36} className="h-9 w-9" alt="WhatsApp" />
                            </OrbitingCircles>

                            {/* Outer Circle */}
                            <OrbitingCircles
                                radius={140}
                                duration={30}
                                reverse
                                iconSize={50}
                                className="border-none bg-transparent"
                            >
                                <Image src="/platforms/discord.svg" width={36} height={36} className="h-9 w-9" alt="Discord" />
                                <MessageCircle className="h-9 w-9 text-red-500" />
                                <MessageSquare className="h-9 w-9 text-yellow-500" />
                                <Bot className="h-9 w-9 text-orange-500" />
                                <User className="h-9 w-9 text-blue-500" />
                            </OrbitingCircles>
                        </div>
                    </div>
                </section>


            </main>

            <footer className="w-full py-12 flex justify-center border-t border-border">
                <div className="max-w-4xl mx-auto w-full px-4 md:px-6 flex flex-col sm:flex-row justify-between items-center gap-6">
                    <div className="flex items-center gap-2">
                        <div className="rounded-lg bg-foreground p-1">
                            <Command className="h-4 w-4 text-background" />
                        </div>
                        <span className="font-bold text-lg tracking-tight">Linkos</span>
                    </div>
                    <p className="text-sm text-muted-foreground">
                        © 2026 Linkos. All rights reserved.
                    </p>
                    <div className="flex gap-6">
                        <Link className="text-sm text-muted-foreground hover:text-foreground transition-colors" href="#">
                            Twitter
                        </Link>
                        <Link className="text-sm text-muted-foreground hover:text-foreground transition-colors" href="https://github.com/zonlabs/linkos" target="_blank">
                            <Github className="h-5 w-5" />
                        </Link>
                    </div>
                </div>
            </footer>
        </div>
    );
}

const Sparkles = ({ className }: { className?: string }) => (
    <svg
        xmlns="http://www.w3.org/2000/svg"
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={className}
    >
        <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z" />
        <path d="M5 3v4" />
        <path d="M19 17v4" />
        <path d="M3 5h4" />
        <path d="M17 19h4" />
    </svg>
)
