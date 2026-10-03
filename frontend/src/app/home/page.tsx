"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import Landing from "../../components/Landing";

export default function HomePage() {
    const router = useRouter();

    useEffect(() => {
        if (typeof window !== "undefined" && localStorage.getItem("token")) {
            router.replace("/"); // already signed in -> straight to the app
        }
    }, [router]);

    return <Landing />;
}
