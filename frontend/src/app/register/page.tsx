'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Sprout, Loader2, UserPlus } from 'lucide-react';
import { API_ENDPOINTS } from '@/lib/api';
import PageBackground from '@/components/primitives/PageBackground';

export default function RegisterPage() {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const router = useRouter();

    const handleRegister = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setIsLoading(true);

        try {
            const res = await fetch(API_ENDPOINTS.register, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ username, password, role: 'student' }),
            });

            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.detail || 'Registration failed');
            }

            router.push('/login');
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : String(err));
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <PageBackground variant="auth" className="flex min-h-screen items-center justify-center p-4 font-sans">
            <div className="z-10 w-full max-w-sm rounded-2xl border border-line/80 bg-surface/85 p-8 shadow-2xl backdrop-blur-xl transition-all">
                <div className="mb-8 flex flex-col items-center">
                    <div className="mb-4 flex size-12 items-center justify-center rounded-2xl border border-emerald-500/30 bg-emerald-500/10 text-emerald-400 shadow-lg">
                        <Sprout size={24} strokeWidth={2.2} />
                    </div>
                    <div className="flex items-center gap-1.5">
                        <h2 className="text-[17px] font-semibold tracking-wider text-ink uppercase">RAG UZHAVAN</h2>
                        <span className="font-mono text-[11px] text-emerald-400/80 uppercase">/ உழவன்</span>
                    </div>
                    <p className="mt-1 text-[13px] text-ink-3 font-light">Create an account for local farm advisories</p>
                </div>

                <form onSubmit={handleRegister} className="space-y-4">
                    {error && (
                        <div className="rounded-lg border border-red/30 bg-red-tint p-2.5 text-center">
                            <p className="text-[12.5px] font-medium text-red">{error}</p>
                        </div>
                    )}

                    <div className="space-y-3">
                        <div>
                            <label className="mb-1.5 block text-[12px] font-medium tracking-wide text-ink-2 uppercase">
                                Username
                            </label>
                            <input
                                type="text"
                                value={username}
                                onChange={(e) => setUsername(e.target.value)}
                                className="w-full rounded-lg border border-line bg-field/80 px-3.5 py-2.5 text-[14px] text-ink outline-none transition-colors placeholder:text-ink-3 focus:border-emerald-500/60"
                                placeholder="Choose a username"
                                required
                            />
                        </div>
                        <div>
                            <label className="mb-1.5 block text-[12px] font-medium tracking-wide text-ink-2 uppercase">
                                Password
                            </label>
                            <input
                                type="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                className="w-full rounded-lg border border-line bg-field/80 px-3.5 py-2.5 text-[14px] text-ink outline-none transition-colors placeholder:text-ink-3 focus:border-emerald-500/60"
                                placeholder="Create a secure password"
                                required
                            />
                        </div>
                    </div>

                    <button
                        type="submit"
                        disabled={isLoading || !username || !password}
                        className="mt-2 flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-[13.5px] font-semibold text-white shadow-md transition-all hover:bg-emerald-500 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-40"
                    >
                        {isLoading ? <Loader2 size={16} className="animate-spin" /> : (
                            <>
                                Register Account
                                <UserPlus size={16} />
                            </>
                        )}
                    </button>
                </form>

                <div className="mt-6 border-t border-line/60 pt-4 text-center">
                    <p className="text-[13px] text-ink-3 font-light">
                        Already have an account?{' '}
                        <a href="/login" className="font-medium text-emerald-400 hover:text-emerald-300 transition-colors">
                            Sign in
                        </a>
                    </p>
                </div>
            </div>
        </PageBackground>
    );
}
