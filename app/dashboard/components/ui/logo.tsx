"use client"

import Link from "next/link"
import { Command } from "lucide-react"
import { cn } from "@/lib/utils"

interface LogoProps {
    className?: string
    iconOnly?: boolean
    showText?: boolean
    linkHome?: boolean
    size?: "sm" | "md" | "lg"
}

export function Logo({
    className,
    iconOnly = false,
    showText = true,
    linkHome = true,
    size = "md"
}: LogoProps) {
    const sizeClasses = {
        sm: { container: "gap-1.5", icon: "p-1", iconSize: "h-3.5 w-3.5", text: "text-lg" },
        md: { container: "gap-2", icon: "p-1.5", iconSize: "h-4 w-4", text: "text-xl" },
        lg: { container: "gap-2.5", icon: "p-2", iconSize: "h-6 w-6", text: "text-2xl" },
    }

    const content = (
        <div className={cn("flex items-center font-bold tracking-tight group transition-all", sizeClasses[size].container, className)}>
            <div className={cn(
                "rounded-sm bg-foreground shadow-[0_0_15px_rgba(var(--primary),0.2)] group-hover:scale-110 transition-transform duration-300",
                sizeClasses[size].icon
            )}>
                <Command className={cn("text-background", sizeClasses[size].iconSize)} />
            </div>
            {!iconOnly && showText && (
                <span className={cn("text-gradient-premium", sizeClasses[size].text)}>Linkos</span>
            )}
        </div>
    )

    if (linkHome) {
        return (
            <Link href="/" className="inline-block transition-opacity hover:opacity-80">
                {content}
            </Link>
        )
    }

    return content
}
