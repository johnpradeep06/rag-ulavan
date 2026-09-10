"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Pencil, Check, X, Loader2 } from "lucide-react";
import { API_ENDPOINTS } from "@/lib/api";

type Profile = {
    username: string;
    role: string;
    full_name: string | null;
    phone: string | null;
    state: string | null;
    district: string | null;
    primary_crop: string | null;
};

const FIELDS: { key: keyof Profile; label: string; placeholder: string }[] = [
    { key: "full_name", label: "Name", placeholder: "Your name" },
    { key: "phone", label: "Phone", placeholder: "Mobile number" },
    { key: "state", label: "State", placeholder: "e.g. Tamil Nadu" },
    { key: "district", label: "District", placeholder: "e.g. Thanjavur" },
    { key: "primary_crop", label: "Primary crop", placeholder: "e.g. Rice" },
];

export default function ProfileMenu() {
    const [profile, setProfile] = useState<Profile | null>(null);
    const [open, setOpen] = useState(false);
    const [editing, setEditing] = useState(false);
    const [draft, setDraft] = useState<Partial<Profile>>({});
    const [saving, setSaving] = useState(false);
    const wrapRef = useRef<HTMLDivElement>(null);

    const load = useCallback(async () => {
        const token = localStorage.getItem("token");
        if (!token) return;
        try {
            const res = await fetch(API_ENDPOINTS.me, { headers: { Authorization: `Bearer ${token}` } });
            if (res.ok) setProfile(await res.json());
        } catch { /* ignore */ }
    }, []);

    useEffect(() => { load(); }, [load]);

    // click-outside closes (only matters while pinned/editing)
    useEffect(() => {
        if (!open) return;
        const onClick = (e: MouseEvent) => {
            if (wrapRef.current && !wrapRef.current.contains(e.target as HTMLElement)) {
                setOpen(false);
                setEditing(false);
            }
        };
        document.addEventListener("mousedown", onClick);
        return () => document.removeEventListener("mousedown", onClick);
    }, [open]);

    if (!profile) return null;

    const initial = (profile.full_name || profile.username || "?").trim().charAt(0).toUpperCase();

    const startEdit = () => {
        setDraft({
            full_name: profile.full_name ?? "",
            phone: profile.phone ?? "",
            state: profile.state ?? "",
            district: profile.district ?? "",
            primary_crop: profile.primary_crop ?? "",
        });
        setEditing(true);
        setOpen(true);
    };

    const save = async () => {
        setSaving(true);
        try {
            const token = localStorage.getItem("token");
            const res = await fetch(API_ENDPOINTS.me, {
                method: "PATCH",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                body: JSON.stringify(draft),
            });
            if (res.ok) setProfile(await res.json());
        } finally {
            setSaving(false);
            setEditing(false);
        }
    };

    return (
        <div
            ref={wrapRef}
            className="relative"
            onMouseEnter={() => !editing && setOpen(true)}
            onMouseLeave={() => !editing && setOpen(false)}
        >
            <button
                onClick={() => setOpen((v) => !v)}
                className="flex items-center gap-2 rounded-full border border-line bg-surface py-1 pl-1 pr-3 text-[12.5px] font-medium text-ink-2 shadow-btn transition-colors hover:bg-hover hover:text-ink"
            >
                <span className="flex size-6 items-center justify-center rounded-full bg-accent text-[11px] font-semibold text-white">
                    {initial}
                </span>
                {profile.full_name || profile.username}
            </button>

            {open && (
                <div className="absolute right-0 top-[calc(100%+6px)] z-50 w-64 rounded-window border border-line bg-surface p-3.5 shadow-overlay">
                    <div className="mb-2.5 flex items-center gap-2.5">
                        <span className="flex size-9 items-center justify-center rounded-full bg-accent text-[14px] font-semibold text-white">
                            {initial}
                        </span>
                        <div className="min-w-0">
                            <div className="truncate text-[13.5px] font-semibold text-ink">
                                {profile.full_name || profile.username}
                            </div>
                            <div className="text-[11.5px] text-ink-3 capitalize">{profile.role}</div>
                        </div>
                        {!editing && (
                            <button
                                onClick={startEdit}
                                title="Edit profile"
                                className="ml-auto rounded-control p-1.5 text-ink-3 transition-colors hover:bg-hover hover:text-ink"
                            >
                                <Pencil size={13} />
                            </button>
                        )}
                    </div>

                    <div className="space-y-1.5 border-t border-line pt-2.5 text-[12.5px]">
                        {FIELDS.map((f) => (
                            <div key={f.key} className="flex items-center gap-2">
                                <span className="w-[86px] shrink-0 text-ink-3">{f.label}</span>
                                {editing ? (
                                    <input
                                        value={(draft[f.key] as string) ?? ""}
                                        onChange={(e) => setDraft((d) => ({ ...d, [f.key]: e.target.value }))}
                                        placeholder={f.placeholder}
                                        className="min-w-0 flex-1 rounded-[6px] border border-line bg-field px-2 py-1 text-[12.5px] text-ink outline-none focus:border-line-strong"
                                    />
                                ) : (
                                    <span className={`flex-1 truncate ${profile[f.key] ? "text-ink-2" : "text-ink-3 italic"}`}>
                                        {profile[f.key] || "—"}
                                    </span>
                                )}
                            </div>
                        ))}
                    </div>

                    {editing && (
                        <div className="mt-3 flex gap-2">
                            <button
                                onClick={save}
                                disabled={saving}
                                className="flex flex-1 items-center justify-center gap-1.5 rounded-control bg-accent py-1.5 text-[12px] font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
                            >
                                {saving ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
                                Save
                            </button>
                            <button
                                onClick={() => setEditing(false)}
                                className="flex items-center justify-center gap-1.5 rounded-control border border-line px-3 py-1.5 text-[12px] font-medium text-ink-2 transition-colors hover:bg-hover"
                            >
                                <X size={13} />
                                Cancel
                            </button>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
