"use client";

import { Header } from "@/components/layout/header";

export default function DashboardLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <div className="min-h-screen bg-background text-foreground transition-colors duration-500">
            <Header />
            <main>
                {children}
            </main>
        </div>
    );
}
