"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import NextLink from "next/link";
import { Clock3, Eye, EyeOff, History, Loader2, MailCheck, RefreshCw } from "lucide-react";
import { loginSchema, type LoginInput } from "@/lib/validations/auth";
import { login, resendClientLoginOtp, verifyClientLoginOtp } from "@/lib/actions/auth";
import { BotCheck } from "@/components/security/BotCheck";
import { readLastAccess, rememberLastAccess, type LastAccess } from "@/lib/last-access";
import { GoogleAuthButton } from "@/components/marketing/GoogleAuthButton";
import { LinkedInAuthButton } from "@/components/marketing/LinkedInAuthButton";

/** Human-friendly copy for the ?error= codes our OAuth routes redirect back with. */
function oauthErrorMessage(code: string): string {
    switch (code) {
        case "google_disabled":
            return "Google sign-in isn't enabled for this project yet. Use email and password, or try again shortly.";
        case "google_start_failed":
            return "We couldn't start Google sign-in. Please try again.";
        case "linkedin_disabled":
            return "LinkedIn sign-in isn't enabled for this project yet. Use email and password, or try again shortly.";
        case "linkedin_start_failed":
            return "We couldn't start LinkedIn sign-in. Please try again.";
        case "linkedin_cancelled":
            return "LinkedIn sign-in was cancelled. Please try again when you're ready.";
        case "linkedin_state_failed":
            return "The LinkedIn sign-in request expired. Please start again.";
        case "linkedin_callback_failed":
            return "LinkedIn sign-in couldn't be completed. Please try again.";
        case "auth_code_exchange_failed":
            return "Sign-in didn't complete. Please try again.";
        case "verification_link_invalid":
            return "That verification link has expired or was already used. Sign up again with the same email to receive a new one.";
        default:
            return decodeURIComponent(code).replace(/\+/g, " ");
    }
}

/**
 * The marker on whichever provider button this browser used last. It carries
 * the address as well as the name, because someone with a work Google and a
 * personal one needs to know which account is waiting.
 */
function LastUsedBadge({ email }: { email: string }) {
    return (
        <span className="pointer-events-none absolute -top-3 right-3 inline-flex max-w-[calc(100%-2rem)] items-center gap-1.5 rounded-full border border-blue-200 bg-brand-blue px-3 py-1 text-[10px] font-semibold leading-none text-white shadow-sm sm:right-4">
            Last used
            <span className="truncate font-medium text-white/85">{email}</span>
        </span>
    );
}

/**
 * LoginForm - 1:1 Figma-aligned implementation with real auth logic.
 */
export const LoginForm = ({
    oauthErrorParam,
    accountState,
    nextPath,
    emailVerified = false,
}: {
    oauthErrorParam: string | null;
    accountState: "closed" | "suspended" | null;
    nextPath: string;
    /** Arrived from a CDS Space verification link that was just accepted. */
    emailVerified?: boolean;
}) => {
    const [showPassword, setShowPassword] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(oauthErrorParam ? oauthErrorMessage(oauthErrorParam) : null);
    const [lastAccess, setLastAccess] = useState<LastAccess | null>(null);
    const [botToken, setBotToken] = useState("");
    const [botResetSignal, setBotResetSignal] = useState(0);
    const [loginEmail, setLoginEmail] = useState("");
    const [otp, setOtp] = useState("");
    const [now, setNow] = useState(() => Date.now());
    const [challenge, setChallenge] = useState<{
        id: string;
        maskedEmail: string;
        expiresAt: number;
        resendAt: number;
    } | null>(null);
    const onBotTokenChange = useCallback((token: string) => setBotToken(token), []);

    const {
        register,
        handleSubmit,
        setValue,
        formState: { errors },
    } = useForm<LoginInput>({
        resolver: zodResolver(loginSchema),
    });

    useEffect(() => {
        setLastAccess(readLastAccess());
    }, []);

    useEffect(() => {
        if (!challenge) return;
        const timer = window.setInterval(() => setNow(Date.now()), 1000);
        return () => window.clearInterval(timer);
    }, [challenge]);

    const expiresIn = useMemo(() => challenge ? Math.max(0, Math.ceil((challenge.expiresAt - now) / 1000)) : 0, [challenge, now]);
    const resendIn = useMemo(() => challenge ? Math.max(0, Math.ceil((challenge.resendAt - now) / 1000)) : 0, [challenge, now]);

    function resetBotCheck() {
        setBotToken("");
        setBotResetSignal((value) => value + 1);
    }

    const onSubmit = async (data: LoginInput) => {
        if (!botToken) {
            setError("Complete the security verification before signing in.");
            return;
        }
        setIsLoading(true);
        setError(null);
        setLoginEmail(data.email.trim().toLowerCase());
        try {
            const result = await login({ ...data, next: nextPath, botToken });
            if (result?.error) {
                setError(result.error);
                resetBotCheck();
            } else if (result?.requiresOtp && result.challengeId) {
                const current = Date.now();
                setNow(current);
                setChallenge({
                    id: result.challengeId,
                    maskedEmail: result.maskedEmail || "your email address",
                    expiresAt: current + Number(result.expiresInSeconds || 900) * 1000,
                    resendAt: current + Number(result.resendInSeconds || 60) * 1000,
                });
                setOtp("");
                resetBotCheck();
            }
        } catch (e) {
            setError("Something went wrong. Please try again.");
            resetBotCheck();
        } finally {
            setIsLoading(false);
        }
    };

    const verifyOtp = async () => {
        if (!challenge || otp.length !== 6 || expiresIn <= 0) return;
        setIsLoading(true);
        setError(null);
        try {
            const result = await verifyClientLoginOtp({ challengeId: challenge.id, otp });
            if (result?.error) {
                setError(result.error);
                if (result.expired) setChallenge(null);
                return;
            }
            if (result?.success) {
                rememberLastAccess({ email: loginEmail, provider: 'password', method: 'Email and password' });
                window.location.replace(result.next || nextPath);
            }
        } catch {
            setError("Verification could not be completed. Please try again.");
        } finally {
            setIsLoading(false);
        }
    };

    const resendOtp = async () => {
        if (!challenge || resendIn > 0) return;
        setIsLoading(true);
        setError(null);
        try {
            const result = await resendClientLoginOtp({ challengeId: challenge.id });
            if (result?.error) {
                setError(result.error);
                if (result.expired) setChallenge(null);
                return;
            }
            const current = Date.now();
            setNow(current);
            setOtp("");
            setChallenge({
                ...challenge,
                expiresAt: current + Number(result.expiresInSeconds || 900) * 1000,
                resendAt: current + Number(result.resendInSeconds || 60) * 1000,
            });
        } catch {
            setError("A new code could not be sent. Please try again.");
        } finally {
            setIsLoading(false);
        }
    };

    function formatCountdown(totalSeconds: number) {
        return `${Math.floor(totalSeconds / 60)}:${String(totalSeconds % 60).padStart(2, "0")}`;
    }

    return (
        <div className="w-full flex flex-col gap-6 lg:gap-8 xl:gap-[32px] 2xl:gap-[40px]">

            {/* Header */}
            <div className="flex flex-col gap-1.5 2xl:gap-2">
                <h1 className="text-brand-navy text-[24px] lg:text-[28px] xl:text-[32px] 2xl:text-[40px] font-semibold tracking-[-0.02em] leading-tight">
                    Sign in
                </h1>
                <p className="text-brand-body text-[13px] lg:text-[14px] xl:text-[15px] 2xl:text-[16px] font-medium leading-relaxed">
                    Welcome back! Access your dashboard and pick up where you left off
                </p>
            </div>

            {emailVerified && (
                <div className="rounded-2xl border border-emerald-100 bg-emerald-50/80 px-4 py-3 text-[13px] leading-5 text-emerald-900">
                    Your email address is verified. Sign in to finish setting up your CDS Space account.
                </div>
            )}

            {accountState === "closed" && (
                <div className="rounded-2xl border border-blue-100 bg-blue-50/70 px-4 py-3 text-[13px] leading-5 text-brand-body">
                    Your CDS Space business account has been closed and all active sessions were signed out. Previous business records remain retained for accounting and transaction-history purposes.
                </div>
            )}

            {accountState === "suspended" && (
                <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-[13px] leading-5 text-amber-900">
                    This account is temporarily suspended because its sign-in identity could not be verified. Use a previously connected Google or LinkedIn account, or contact support to restore access.
                </div>
            )}

            {lastAccess?.provider === "password" && !challenge && (
                <div className="relative mt-2 flex items-center gap-3 rounded-2xl border border-blue-100 bg-blue-50/60 p-3.5 pt-5">
                    <span className="absolute -top-3 left-4 rounded-full border border-blue-200 bg-brand-blue px-3 py-1 text-[10px] font-semibold text-white shadow-sm">
                        Last used access
                    </span>
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white text-brand-blue shadow-sm">
                        <History className="h-4 w-4" aria-hidden="true" />
                    </span>
                    <div className="min-w-0 flex-1">
                        <p className="truncate text-[13px] font-semibold text-brand-navy">{lastAccess.email}</p>
                        <p className="text-[11px] text-brand-mute">{lastAccess.method} · {new Date(lastAccess.at).toLocaleDateString()}</p>
                    </div>
                    <button type="button" onClick={() => setValue('email', lastAccess.email, { shouldValidate: true })}
                        className="shrink-0 rounded-lg border border-blue-200 bg-white px-3 py-2 text-[11px] font-bold text-brand-blue hover:bg-blue-50">
                        Use email
                    </button>
                </div>
            )}

            {/* Social sign-in leads, because most people return the way they
                arrived. Whichever provider this browser used last says so, with
                the address, so nobody has to remember which account it was. */}
            {!challenge && (
                <div className="flex w-full flex-col gap-2.5 lg:gap-3">
                    <div className="relative w-full" data-social-provider="google">
                        <GoogleAuthButton label="Continue with Google" next={nextPath} />
                        {lastAccess?.provider === "google" && <LastUsedBadge email={lastAccess.email} />}
                    </div>

                    <div className="relative w-full" data-social-provider="linkedin">
                        <LinkedInAuthButton label="Continue with LinkedIn" next={nextPath} />
                        {lastAccess?.provider === "linkedin" && <LastUsedBadge email={lastAccess.email} />}
                    </div>
                </div>
            )}

            {/* Divider */}
            {!challenge && (
                <div className="flex w-full items-center">
                    <div className="h-px flex-1 bg-brand-stroke opacity-10" />
                    <span className="px-3 text-[13px] font-medium text-brand-mute lg:px-4 lg:text-[14px] 2xl:text-[15px]">Or sign in with your email</span>
                    <div className="h-px flex-1 bg-brand-stroke opacity-10" />
                </div>
            )}

            {/* Form Fields */}
            <form
                onSubmit={challenge
                    ? (event) => { event.preventDefault(); void verifyOtp(); }
                    : handleSubmit(onSubmit)}
                className="flex flex-col gap-4 lg:gap-5 2xl:gap-6"
            >

                {challenge ? (
                    <div className="space-y-4 rounded-2xl border border-blue-100 bg-blue-50/60 p-4 sm:p-5">
                        <div className="flex items-start gap-3">
                            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white text-[#0A4FE8] shadow-sm">
                                <MailCheck className="h-5 w-5" aria-hidden="true" />
                            </span>
                            <div>
                                <h2 className="text-[15px] font-semibold text-brand-navy">Check your email</h2>
                                <p className="mt-1 text-[12px] leading-5 text-brand-body">
                                    Enter the six-digit code sent to {challenge.maskedEmail}. Your dashboard remains locked until it is verified.
                                </p>
                            </div>
                        </div>
                        <input
                            name="client_login_otp"
                            value={otp}
                            onChange={(event) => setOtp(event.target.value.replace(/\D/g, "").slice(0, 6))}
                            inputMode="numeric"
                            autoComplete="one-time-code"
                            maxLength={6}
                            aria-label="Six-digit email code"
                            placeholder="6-digit code"
                            disabled={isLoading || expiresIn <= 0}
                            className="min-h-14 w-full rounded-xl border border-blue-200 bg-white px-4 text-center text-[22px] font-semibold tracking-[0.22em] text-brand-navy outline-none focus:border-[#0A4FE8] focus:ring-4 focus:ring-blue-100 disabled:opacity-60"
                        />
                        <div className="flex flex-wrap items-center justify-between gap-3 text-[11px]">
                            <span className={expiresIn > 0 ? "inline-flex items-center gap-1.5 text-brand-mute" : "inline-flex items-center gap-1.5 text-rose-600"}>
                                <Clock3 className="h-3.5 w-3.5" aria-hidden="true" />
                                {expiresIn > 0 ? `Expires in ${formatCountdown(expiresIn)}` : "Code expired. Start again."}
                            </span>
                            <button
                                type="button"
                                onClick={() => void resendOtp()}
                                disabled={isLoading || resendIn > 0 || expiresIn <= 0}
                                className="inline-flex items-center gap-1.5 font-semibold text-[#0A4FE8] disabled:text-brand-mute"
                            >
                                <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                                {resendIn > 0 ? `Resend in ${resendIn}s` : "Resend code"}
                            </button>
                        </div>
                    </div>
                ) : (
                    <>

                {/* Email address */}
                <div className="flex flex-col gap-1.5 2xl:gap-2">
                    <label className="text-brand-body text-[13px] lg:text-[14px] 2xl:text-[15px] font-medium">Email address</label>
                    <div className={`rounded-[16px] border bg-brand-bg p-[5px] transition-[border-color,box-shadow] focus-within:border-brand-blue/40 focus-within:shadow-[0_0_0_4px_rgba(219,234,254,0.8)] ${errors.email ? 'border-red-500' : 'border-brand-stroke'}`}>
                        <div style={{ borderRadius: "inherit" }} className="flex min-h-11 items-center bg-white px-3.5 shadow-[0_1px_2px_rgba(4,11,55,0.04)] lg:min-h-12 lg:px-4 2xl:min-h-14">
                            <input
                                {...register("email")}
                                type="email"
                                placeholder="Enter your email"
                                disabled={isLoading}
                                className="w-full !min-h-0 !rounded-none !border-0 !bg-transparent !p-0 !shadow-none !ring-0 outline-none text-brand-navy text-[16px] font-medium placeholder:text-brand-mute disabled:opacity-50 lg:text-[14px] 2xl:text-[15px]"
                            />
                        </div>
                    </div>
                    {errors.email && <span className="text-red-500 text-[11px] lg:text-[12px] 2xl:text-[13px]">{errors.email.message}</span>}
                </div>

                {/* Password */}
                <div className="flex flex-col gap-1.5 2xl:gap-2">
                    <div className="flex justify-between items-center">
                        <label className="text-brand-body text-[13px] lg:text-[14px] 2xl:text-[15px] font-medium">Password</label>
                        <NextLink href="/forgot-password" className="text-brand-blue text-[12px] lg:text-[13px] 2xl:text-[14px] font-semibold hover:underline">
                            Forgot Password?
                        </NextLink>
                    </div>
                    <div className={`rounded-[16px] border bg-brand-bg p-[5px] transition-[border-color,box-shadow] focus-within:border-brand-blue/40 focus-within:shadow-[0_0_0_4px_rgba(219,234,254,0.8)] ${errors.password ? 'border-red-500' : 'border-brand-stroke'}`}>
                        <div style={{ borderRadius: "inherit" }} className="flex min-h-11 items-center gap-3 bg-white px-3.5 shadow-[0_1px_2px_rgba(4,11,55,0.04)] lg:min-h-12 lg:px-4 2xl:min-h-14">
                            <input
                                {...register("password")}
                                type={showPassword ? "text" : "password"}
                                placeholder="Enter your password"
                                disabled={isLoading}
                                className="w-full !min-h-0 !rounded-none !border-0 !bg-transparent !p-0 !shadow-none !ring-0 outline-none text-brand-navy text-[16px] font-medium placeholder:text-brand-mute disabled:opacity-50 lg:text-[14px] 2xl:text-[15px]"
                            />
                            <button
                                type="button"
                                onClick={() => setShowPassword(!showPassword)}
                                aria-label={showPassword ? "Hide password" : "Show password"}
                                className="grid size-10 shrink-0 place-items-center !rounded-[8px] text-brand-mute transition-colors hover:bg-brand-bg hover:text-brand-body"
                            >
                                {showPassword ? <EyeOff className="h-5 w-5" aria-hidden="true" /> : <Eye className="h-5 w-5" aria-hidden="true" />}
                            </button>
                        </div>
                    </div>
                    {errors.password && <span className="text-red-500 text-[11px] lg:text-[12px] 2xl:text-[13px]">{errors.password.message}</span>}
                </div>

                    <BotCheck action="client_login" onTokenChange={onBotTokenChange} resetSignal={botResetSignal} />
                    </>
                )}

                {error && (
                    <div className="bg-red-50 border border-red-200 text-red-600 px-3 lg:px-4 py-2.5 lg:py-3 rounded-lg text-xs lg:text-sm font-medium">
                        {error}
                    </div>
                )}

                {/* CTA Button */}
                <button
                    type="submit"
                    disabled={isLoading || (challenge ? otp.length !== 6 || expiresIn <= 0 : !botToken)}
                    className="w-full h-[40px] lg:h-[48px] 2xl:h-[56px] rounded-[10px] lg:rounded-[12px] 2xl:rounded-[16px] p-[2px] bg-brand-bg border border-[#648EFC] shadow-[0_4px_8px_rgba(0,0,0,0.04)] group overflow-hidden disabled:opacity-70 disabled:cursor-not-allowed"
                >
                    <div style={{ borderRadius: "inherit" }} className="w-full h-full flex items-center justify-center transition-opacity group-hover:opacity-90 bg-[#0A4FE8]"
                    >
                        {isLoading ? (
                            <Loader2 className="w-4 h-4 lg:w-5 lg:h-5 2xl:w-6 2xl:h-6 animate-spin text-white" />
                        ) : (
                            <span className="text-brand-bg text-[14px] lg:text-[15px] 2xl:text-[18px] font-medium">
                                {challenge ? "Verify and sign in" : "Sign in"}
                            </span>
                        )}
                    </div>
                </button>
            </form>

            {challenge && (
                <button
                    type="button"
                    onClick={() => { setChallenge(null); setOtp(""); setError(null); resetBotCheck(); }}
                    className="self-center text-[12px] font-semibold text-brand-blue hover:underline"
                >
                    Use a different email
                </button>
            )}

            {/* Bottom Actions */}
            {!challenge && <div className="flex flex-col gap-5 lg:gap-6 2xl:gap-[32px] items-center">

                {/* Signup Link */}
                <div className="flex items-center gap-1.5 lg:gap-2 text-[13px] lg:text-[14px] 2xl:text-[15px]">
                    <span className="text-brand-body font-medium">Don&apos;t have an account?</span>
                    <NextLink href={`/signup${nextPath !== "/dashboard" ? `?next=${encodeURIComponent(nextPath)}` : ""}`} className="text-brand-blue font-semibold hover:underline decoration-2 underline-offset-4">
                        Create account
                    </NextLink>
                </div>
            </div>}

        </div>
    );
};
