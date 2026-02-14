import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Command, MessageSquare, Shield, Zap, ArrowRight, Bot, Globe } from "lucide-react";

export default function Home() {
  return (
    <div className="flex flex-col min-h-screen bg-black text-zinc-100">
      {/* Navigation */}
      <header className="px-4 lg:px-6 h-16 flex items-center border-b border-zinc-900 bg-black/50 backdrop-blur-xl sticky top-0 z-50">
        <div className="max-w-4xl mx-auto w-full flex items-center">
          <Link className="flex items-center justify-center gap-2" href="/">
            <div className="rounded bg-white p-1">
              <Command className="h-4 w-4 text-black" />
            </div>
            <span className="font-bold text-xl tracking-tight">Linkos</span>
          </Link>
          <nav className="ml-auto flex gap-4 sm:gap-6 items-center">
            <Link className="text-sm font-medium hover:text-zinc-400 transition-colors" href="/login">
              Sign In
            </Link>
            <Button size="sm" className="bg-white text-black hover:bg-zinc-200" asChild>
              <Link href="/signup">Get Started</Link>
            </Button>
          </nav>
        </div>
      </header>

      <main className="flex-1">
        {/* Hero Section */}
        <section className="w-full py-24 md:py-32 lg:py-48 flex justify-center border-b border-zinc-900">
          <div className="max-w-4xl mx-auto px-4 md:px-6 text-center space-y-8">
            <div className="space-y-4">
              <h1 className="text-4xl font-extrabold tracking-tighter sm:text-5xl md:text-6xl flex flex-col items-center">
                Connect your AI Agents to
                <span className="text-white whitespace-nowrap">
                  Every Platform.
                </span>
              </h1>
              <p className="mx-auto max-w-[600px] text-zinc-400 md:text-xl/relaxed lg:text-base/relaxed xl:text-xl/relaxed">
                The ultimate gateway for AI agents. One protocol (AG-UI) to rule them all.
                Deploy bots on Telegram, Discord, and Slack in seconds.
              </p>
            </div>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button size="lg" className="bg-white text-black hover:bg-zinc-200 px-8" asChild>
                <Link href="/signup">
                  Start Building <Zap className="ml-2 h-4 w-4 fill-current text-black" />
                </Link>
              </Button>
              <Button size="lg" variant="outline" className="border-zinc-800 text-zinc-400 hover:bg-black hover:text-white" asChild>
                <Link href="/login">
                  Live Demo <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            </div>
            <div className="pt-8">
              <div className="inline-flex items-center rounded-full border border-zinc-800 bg-zinc-900/50 px-3 py-1 text-sm text-zinc-400">
                <span className="flex h-2 w-2 rounded-full bg-white mr-2 shrink-0 animate-pulse" />
                v1.0 is now live — Join 1,000+ developers
              </div>
            </div>
          </div>
        </section>

        {/* Features Section */}
        <section className="w-full py-24 flex justify-center bg-zinc-900/20">
          <div className="max-w-4xl mx-auto px-4 md:px-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-12">
              <div className="space-y-4">
                <div className="inline-flex h-12 w-12 items-center justify-center rounded-lg bg-black border border-zinc-800">
                  <Globe className="h-6 w-6 text-white" />
                </div>
                <h3 className="text-xl font-bold">Multi-Platform</h3>
                <p className="text-zinc-400 leading-relaxed text-sm">
                  Connect once, deploy everywhere. Support for Telegram, Discord, and Slack out of the box.
                </p>
              </div>
              <div className="space-y-4">
                <div className="inline-flex h-12 w-12 items-center justify-center rounded-lg bg-black border border-zinc-800">
                  <Shield className="h-6 w-6 text-white" />
                </div>
                <h3 className="text-xl font-bold">Enterprise Isolation</h3>
                <p className="text-zinc-400 leading-relaxed text-sm">
                  Dedicated tunnels for every connection. Multi-tenant architecture ensures your data stays your own.
                </p>
              </div>
              <div className="space-y-4">
                <div className="inline-flex h-12 w-12 items-center justify-center rounded-lg bg-black border border-zinc-800">
                  <Zap className="h-6 w-6 text-white" />
                </div>
                <h3 className="text-xl font-bold">Streaming Performance</h3>
                <p className="text-zinc-400 leading-relaxed text-sm">
                  Powered by the AG-UI protocol for real-time, low-latency communication between bots and agents.
                </p>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="w-full py-12 flex justify-center border-t border-zinc-900">
        <div className="max-w-4xl mx-auto w-full px-4 md:px-6 flex flex-col sm:flex-row justify-between items-center gap-6">
          <div className="flex items-center gap-2">
            <Command className="h-5 w-5" />
            <span className="font-bold text-lg">Linkos</span>
          </div>
          <p className="text-sm text-zinc-500">
            © 2026 Linkos SaaS. All rights reserved.
          </p>
          <div className="flex gap-6">
            <Link className="text-sm text-zinc-500 hover:text-white" href="#">
              Twitter
            </Link>
            <Link className="text-sm text-zinc-500 hover:text-white" href="#">
              GitHub
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
