"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function AgricultureMapRedirectPage() {
    const router = useRouter();

    useEffect(() => {
        router.replace("/map");
    }, [router]);

    return (
        <div className="flex h-[100dvh] items-center justify-center bg-canvas text-ink-2">
            Redirecting to Agriculture Map…
        </div>
    );
}
