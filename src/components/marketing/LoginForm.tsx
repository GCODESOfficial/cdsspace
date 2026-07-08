"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { motion } from "framer-motion";
import NextLink from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { loginSchema, type LoginInput } from "@/lib/validations/auth";
import { login, oauthLogin } from "@/lib/actions/auth";

/** Human-friendly copy for the ?error= codes our OAuth routes redirect back with. */
function oauthErrorMessage(code: string): string {
    switch (code) {
        case "google_disabled":
            return "Google sign-in isn't enabled for this project yet. Use email and password, or try again shortly.";
        case "google_start_failed":
            return "We couldn't start Google sign-in. Please try again.";
        case "auth_code_exchange_failed":
            return "Google sign-in didn't complete. Please try again.";
        default:
            return decodeURIComponent(code).replace(/\+/g, " ");
    }
}

/**
 * LoginForm - 1:1 Figma-aligned implementation with real auth logic.
 */
export const LoginForm = () => {
    const [showPassword, setShowPassword] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const searchParams = useSearchParams();
    const oauthErrorParam = searchParams.get('error');
    const [error, setError] = useState<string | null>(oauthErrorParam ? oauthErrorMessage(oauthErrorParam) : null);
    const router = useRouter();
    const nextPath = searchParams.get('next') || '/dashboard';

    const {
        register,
        handleSubmit,
        formState: { errors },
    } = useForm<LoginInput>({
        resolver: zodResolver(loginSchema),
    });

    const onSubmit = async (data: LoginInput) => {
        setIsLoading(true);
        setError(null);
        try {
            const result = await login(data);
            if (result?.error) {
                setError(result.error);
            } else if (result?.success) {
                router.push(nextPath);
            }
        } catch (e) {
            setError("Something went wrong. Please try again.");
        } finally {
            setIsLoading(false);
        }
    };

    const handleSocialLogin = async (provider: 'google' | 'twitter' | 'facebook') => {
        try {
            const result = await oauthLogin(provider, nextPath);
            if (result?.error) {
                setError(result.error);
            } else if (result?.url) {
                window.location.href = result.url;
            }
        } catch (e) {
            setError("Social login failed. Please try again.");
        }
    };

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

            {/* Form Fields */}
            <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4 lg:gap-5 2xl:gap-6">

                {/* Email address */}
                <div className="flex flex-col gap-1.5 2xl:gap-2">
                    <label className="text-brand-body text-[13px] lg:text-[14px] 2xl:text-[15px] font-medium">Email address</label>
                    <div className={`bg-brand-bg border rounded-[10px] lg:rounded-[12px] 2xl:rounded-[16px] px-3 lg:px-4 py-3 lg:py-3.5 2xl:py-4 flex items-center transition-colors ${errors.email ? 'border-red-500' : 'border-brand-stroke'}`}>
                        <input
                            {...register("email")}
                            type="email"
                            placeholder="Enter your email"
                            disabled={isLoading}
                            className="w-full bg-transparent outline-none text-brand-navy text-[13px] lg:text-[14px] 2xl:text-[15px] font-medium placeholder:text-brand-mute disabled:opacity-50"
                        />
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
                    <div className={`bg-brand-bg border rounded-[10px] lg:rounded-[12px] 2xl:rounded-[16px] px-3 lg:px-4 py-3 lg:py-3.5 2xl:py-4 flex items-center relative group/input transition-colors ${errors.password ? 'border-red-500' : 'border-brand-stroke'}`}>
                        <input
                            {...register("password")}
                            type={showPassword ? "text" : "password"}
                            placeholder="Enter your password"
                            disabled={isLoading}
                            className="w-full bg-transparent outline-none text-brand-navy text-[13px] lg:text-[14px] 2xl:text-[15px] font-medium placeholder:text-brand-mute disabled:opacity-50"
                        />
                        <button
                            type="button"
                            onClick={() => setShowPassword(!showPassword)}
                            className="text-brand-mute hover:text-brand-body transition-colors"
                        >
                            {showPassword ? <EyeOff className="w-4 h-4 2xl:w-5 2xl:h-5" /> : <Eye className="w-4 h-4 2xl:w-5 2xl:h-5" />}
                        </button>
                    </div>
                    {errors.password && <span className="text-red-500 text-[11px] lg:text-[12px] 2xl:text-[13px]">{errors.password.message}</span>}
                </div>

                {error && (
                    <div className="bg-red-50 border border-red-200 text-red-600 px-3 lg:px-4 py-2.5 lg:py-3 rounded-lg text-xs lg:text-sm font-medium">
                        {error}
                    </div>
                )}

                {/* CTA Button */}
                <button
                    type="submit"
                    disabled={isLoading}
                    className="w-full h-[40px] lg:h-[48px] 2xl:h-[56px] rounded-full p-[2px] bg-brand-bg border border-[#648EFC] shadow-[0_4px_8px_rgba(0,0,0,0.04)] group overflow-hidden disabled:opacity-70 disabled:cursor-not-allowed"
                >
                    <div className="w-full h-full rounded-full flex items-center justify-center transition-opacity group-hover:opacity-90 bg-linear-to-r from-[#0035C1] to-[#0575FF]"
                    >
                        {isLoading ? (
                            <Loader2 className="w-4 h-4 lg:w-5 lg:h-5 2xl:w-6 2xl:h-6 animate-spin text-white" />
                        ) : (
                            <span className="text-brand-bg text-[14px] lg:text-[15px] 2xl:text-[18px] font-medium">Sign In</span>
                        )}
                    </div>
                </button>
            </form>

            {/* Bottom Actions */}
            <div className="flex flex-col gap-5 lg:gap-6 2xl:gap-[32px] items-center">

                {/* Divider */}
                <div className="w-full flex items-center">
                    <div className="flex-1 h-px bg-brand-stroke opacity-10" />
                    <span className="px-3 lg:px-4 text-brand-mute text-[13px] lg:text-[14px] 2xl:text-[15px] font-medium">Or</span>
                    <div className="flex-1 h-px bg-brand-stroke opacity-10" />
                </div>

                {/* Social Login */}
                <div className="w-full flex flex-col gap-2.5 lg:gap-3">
                    <button
                        type="button"
                        onClick={() => handleSocialLogin('google')}
                        className="w-full flex items-center justify-center gap-3 py-3 lg:py-3.5 2xl:py-4 bg-white border border-brand-stroke rounded-[10px] lg:rounded-[12px] 2xl:rounded-[16px] shadow-[0_4px_8px_rgba(0,0,0,0.04)] hover:shadow-md transition-all cursor-pointer group"
                    >
                        <Image
                            src="/auth/Signup/flat-color-icons_google.svg"
                            alt="Google"
                            width={24}
                            height={24}
                            className="2xl:w-7 2xl:h-7"
                        />
                        <span className="text-brand-navy text-[14px] lg:text-[15px] 2xl:text-[16px] font-semibold group-hover:text-brand-blue transition-colors">
                            Continue with Google
                        </span>
                    </button>

                    <button
                        type="button"
                        onClick={() => handleSocialLogin('twitter')}
                        className="w-full flex items-center justify-center gap-3 py-3 lg:py-3.5 2xl:py-4 bg-white border border-brand-stroke rounded-[10px] lg:rounded-[12px] 2xl:rounded-[16px] shadow-[0_4px_8px_rgba(0,0,0,0.04)] hover:shadow-md transition-all cursor-pointer group"
                    >
                        <Image
                            src="/auth/Signup/x-icon.svg"
                            alt="X"
                            width={22}
                            height={22}
                            className="2xl:w-6 2xl:h-6"
                        />
                        <span className="text-brand-navy text-[14px] lg:text-[15px] 2xl:text-[16px] font-semibold group-hover:text-brand-blue transition-colors">
                            Continue with X
                        </span>
                    </button>

                    <button
                        type="button"
                        onClick={() => handleSocialLogin('facebook')}
                        className="w-full flex items-center justify-center gap-3 py-3 lg:py-3.5 2xl:py-4 bg-white border border-brand-stroke rounded-[10px] lg:rounded-[12px] 2xl:rounded-[16px] shadow-[0_4px_8px_rgba(0,0,0,0.04)] hover:shadow-md transition-all cursor-pointer group"
                    >
                        <Image
                            src="/auth/Signup/logos_facebook.svg"
                            alt="Facebook"
                            width={24}
                            height={24}
                            className="2xl:w-7 2xl:h-7"
                        />
                        <span className="text-brand-navy text-[14px] lg:text-[15px] 2xl:text-[16px] font-semibold group-hover:text-brand-blue transition-colors">
                            Continue with Facebook
                        </span>
                    </button>
                </div>

                {/* Signup Link */}
                <div className="flex items-center gap-1.5 lg:gap-2 text-[13px] lg:text-[14px] 2xl:text-[15px]">
                    <span className="text-brand-body font-medium">Don't have an account?</span>
                    <NextLink href={`/signup${searchParams.get('next') ? `?next=${searchParams.get('next')}` : ''}`} className="text-brand-blue font-semibold hover:underline decoration-2 underline-offset-4">
                        Create account
                    </NextLink>
                </div>
            </div>

        </div>
    );
};
