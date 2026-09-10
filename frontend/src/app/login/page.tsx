'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Sprout, Loader2, ArrowRight } from 'lucide-react';
import { API_ENDPOINTS } from '@/lib/api';
import PageBackground from '@/components/primitives/PageBackground';
import { useTranslation, LanguageToggle } from '@/i18n';

export default function LoginPage() {
    const { t } = useTranslation();
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const router = useRouter();

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setIsLoading(true);

        const formData = new FormData();
        formData.append('username', username);
        formData.append('password', password);

        try {
            const res = await fetch(API_ENDPOINTS.token, {
                method: 'POST',
                body: formData,
            });

            if (!res.ok) {
                throw new Error(t('auth.loginFailed'));
            }

            const data = await res.json();
            localStorage.setItem('token', data.access_token);

            // Fetch user role
            const userRes = await fetch(API_ENDPOINTS.me, {
                headers: {
                    'Authorization': `Bearer ${data.access_token}`
                }
            });
            const userData = await userRes.json();
            localStorage.setItem('role', userData.role);

            router.push('/');
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : String(err));
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <PageBackground variant="auth" className="relative flex min-h-screen items-center justify-center p-4 font-sans">
            <div className="absolute top-4 right-4 z-20">
                <LanguageToggle />
            </div>
            <div className="z-10 w-full max-w-sm rounded-2xl border border-line/80 bg-surface/85 p-8 shadow-2xl backdrop-blur-xl transition-all">
                <div className="mb-8 flex flex-col items-center">
                    <div className="mb-4 flex size-12 items-center justify-center rounded-2xl border border-emerald-500/30 bg-emerald-500/10 text-emerald-400 shadow-lg">
                        <Sprout size={24} strokeWidth={2.2} />
                    </div>
                    <div className="flex items-center gap-1.5">
                        <h2 className="text-[17px] font-semibold tracking-wider text-ink uppercase">RAG UZHAVAN</h2>
                        <span className="font-mono text-[11px] text-emerald-400/80 uppercase">/ உழவன்</span>
                    </div>
                    <p className="mt-1 text-[13px] text-ink-3 font-light text-center">{t('auth.signInTitle')}</p>
                </div>

                <form onSubmit={handleLogin} className="space-y-4">
                    {error && (
                        <div className="rounded-lg border border-red/30 bg-red-tint p-2.5 text-center">
                            <p className="text-[12.5px] font-medium text-red">{error}</p>
                        </div>
                    )}

                    <div className="space-y-3">
                        <div>
                            <label className="mb-1.5 block text-[12px] font-medium tracking-wide text-ink-2 uppercase">
                                {t('auth.username')}
                            </label>
                            <input
                                type="text"
                                value={username}
                                onChange={(e) => setUsername(e.target.value)}
                                className="w-full rounded-lg border border-line bg-field/80 px-3.5 py-2.5 text-[14px] text-ink outline-none transition-colors placeholder:text-ink-3 focus:border-emerald-500/60"
                                placeholder={t('auth.usernamePlaceholder')}
                                required
                            />
                        </div>
                        <div>
                            <label className="mb-1.5 block text-[12px] font-medium tracking-wide text-ink-2 uppercase">
                                {t('auth.password')}
                            </label>
                            <input
                                type="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                className="w-full rounded-lg border border-line bg-field/80 px-3.5 py-2.5 text-[14px] text-ink outline-none transition-colors placeholder:text-ink-3 focus:border-emerald-500/60"
                                placeholder={t('auth.passwordPlaceholder')}
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
                                {t('auth.signInButton')}
                                <ArrowRight size={16} />
                            </>
                        )}
                    </button>
                </form>

                <div className="mt-6 border-t border-line/60 pt-4 text-center">
                    <p className="text-[13px] text-ink-3 font-light">
                        {t('auth.noAccount')}{' '}
                        <a href="/register" className="font-medium text-emerald-400 hover:text-emerald-300 transition-colors">
                            {t('auth.registerNow')}
                        </a>
                    </p>
                </div>
            </div>
        </PageBackground>
    );
}
