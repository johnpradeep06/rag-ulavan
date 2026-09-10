"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import ChatInterface from "../components/ChatInterface";
import ProfileMenu from "../components/ProfileMenu";
import PageBackground from "../components/primitives/PageBackground";
import { useTranslation, LanguageToggle } from "@/i18n";

export default function Home() {
    const router = useRouter();
    const { t } = useTranslation();
    const [role, setRole] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const token = localStorage.getItem('token');
        if (!token) {
            router.replace('/home');   // logged out -> the public home page
            return;
        }
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setRole(localStorage.getItem('role'));
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setLoading(false);
    }, [router]);

    const handleLogout = () => {
        localStorage.removeItem('token');
        localStorage.removeItem('role');
        router.push('/login');
    };

    if (loading) return <div className="flex h-[100dvh] items-center justify-center bg-canvas text-ink-2">{t("common.loading")}</div>;

    return (
        <PageBackground variant="chat" className="h-[100dvh]">
            <main className="relative flex h-full w-full flex-col overflow-hidden bg-transparent">
                {/* Top Right Controls */}
                <div className="absolute top-3 right-3 z-50 flex items-center gap-2">
                    <LanguageToggle />
                    {role === 'admin' && (
                        <button
                            onClick={() => router.push('/campus_admin')}
                            className="rounded-control border border-line bg-surface/80 px-3 py-1.5 text-[12.5px] font-medium text-ink-2 shadow-btn backdrop-blur-sm transition-colors hover:bg-hover hover:text-ink hover:border-line-strong"
                        >
                            {t("nav.adminDashboard")}
                        </button>
                    )}
                    <button
                        onClick={handleLogout}
                        className="rounded-control border border-line bg-surface/80 px-3 py-1.5 text-[12.5px] font-medium text-ink-3 shadow-btn backdrop-blur-sm transition-colors hover:bg-hover hover:text-red hover:border-line-strong"
                    >
                        {t("nav.logout")}
                    </button>
                    <ProfileMenu />
                </div>

                <div className="h-full w-full flex-1">
                    <ChatInterface />
                </div>
            </main>
        </PageBackground>
    );
}
