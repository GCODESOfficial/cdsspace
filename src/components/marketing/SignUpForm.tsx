"use client";

import { useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { motion } from "framer-motion";
import { useRouter, useSearchParams } from "next/navigation";
import NextLink from "next/link";
import Image from "next/image";
import { Eye, EyeOff, Loader2, CheckCircle2, Circle } from "lucide-react";
import { signupSchema, type SignupInput } from "@/lib/validations/auth";
import { signup, oauthLogin } from "@/lib/actions/auth";
import { EmailConfirmationModal } from "./EmailConfirmationModal";
import { PhoneInput } from "@/components/shared/PhoneInput";

/**
 * SignUpForm - 1:1 Figma Implementation with real Supabase logic.
 */
export const SignUpForm = () => {
    const [showPassword, setShowPassword] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [isSuccess, setIsSuccess] = useState(false);
    const [userEmail, setUserEmail] = useState("");
    const router = useRouter();
    const searchParams = useSearchParams();
    const nextPath = searchParams.get('next');

    const {
        register,
        handleSubmit,
        control,
        watch,
        formState: { errors },
    } = useForm<SignupInput>({
        resolver: zodResolver(signupSchema),
    });

    const passwordValue = watch("password") || "";

    const onSubmit = async (data: SignupInput) => {
        setIsLoading(true);
        setError(null);
        setUserEmail(data.email);
        try {
            const result = await signup(data);
            if (result?.error) {
                setError(result.error);
            } else {
                setIsSuccess(true);
            }
        } catch (e) {
            setError("Something went wrong. Please try again.");
        } finally {
            setIsLoading(false);
        }
    };

    const handleSocialLogin = async (provider: 'google') => {
        try {
            const result = await oauthLogin(provider, nextPath || undefined);
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
            <EmailConfirmationModal
                isOpen={isSuccess}
                onClose={() => {
                    setIsSuccess(false);
                    router.push(`/login${nextPath ? `?next=${nextPath}` : ''}`);
                }}
                email={userEmail}
            />

            {/* Header: Node 6229:11975 */}
            <div className="flex flex-col gap-1.5 2xl:gap-2">
                <h1 className="text-brand-navy text-[24px] lg:text-[28px] xl:text-[32px] 2xl:text-[40px] font-semibold tracking-[-0.02em] leading-tight">
                    Create an account
                </h1>
                <p className="text-brand-body text-[13px] lg:text-[14px] xl:text-[15px] 2xl:text-[16px] font-medium leading-relaxed">
                    Become part of the CDS Space community. Sign up now and unlock all features
                </p>
            </div>

            {/* Form Fields: Node 6809:22607 */}
            <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4 lg:gap-5 2xl:gap-6">

                {/* Full name: Node 6227:11970 */}
                <div className="flex flex-col gap-1.5 2xl:gap-2">
                    <label className="text-brand-body text-[13px] lg:text-[14px] 2xl:text-[15px] font-medium">Full name</label>
                    <div className={`bg-brand-bg border rounded-[10px] lg:rounded-[12px] 2xl:rounded-[16px] px-3 lg:px-4 py-3 lg:py-3.5 2xl:py-4 flex items-center transition-colors ${errors.fullName ? 'border-red-500' : 'border-brand-stroke'}`}>
                        <input
                            {...register("fullName")}
                            type="text"
                            placeholder="Enter your full name"
                            disabled={isLoading}
                            className="w-full bg-transparent outline-none text-brand-navy text-[13px] lg:text-[14px] 2xl:text-[15px] font-medium placeholder:text-brand-mute disabled:opacity-50"
                        />
                    </div>
                    {errors.fullName && <span className="text-red-500 text-[11px] lg:text-[12px] 2xl:text-[13px]">{errors.fullName.message}</span>}
                </div>

                {/* Email address: Node 6809:22608 */}
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

                {/* Company name: Node 6809:22612 */}
                <div className="flex flex-col gap-1.5 2xl:gap-2">
                    <label className="text-brand-body text-[13px] lg:text-[14px] 2xl:text-[15px] font-medium flex items-center gap-1.5">
                        Company name <span className="text-brand-mute">(optional)</span>
                    </label>
                    <div className="bg-brand-bg border border-brand-stroke rounded-[10px] lg:rounded-[12px] 2xl:rounded-[16px] px-3 lg:px-4 py-3 lg:py-3.5 2xl:py-4 flex items-center">
                        <input
                            {...register("companyName")}
                            type="text"
                            placeholder="Enter your company's name"
                            disabled={isLoading}
                            className="w-full bg-transparent outline-none text-brand-navy text-[13px] lg:text-[14px] 2xl:text-[15px] font-medium placeholder:text-brand-mute disabled:opacity-50"
                        />
                    </div>
                </div>

                {/* Phone number: Node 6809:22603 */}
                <div className="flex flex-col gap-1.5 2xl:gap-2">
                    <label className="text-brand-body text-[13px] lg:text-[14px] 2xl:text-[15px] font-medium">Phone number</label>
                    <Controller
                        control={control}
                        name="phoneNumber"
                        render={({ field: { onChange, onBlur, value, ref } }) => (
                            <PhoneInput
                                value={value}
                                onChange={onChange}
                                onBlur={onBlur}
                                ref={ref}
                                error={!!errors.phoneNumber}
                                disabled={isLoading}
                            />
                        )}
                    />
                    {errors.phoneNumber && <span className="text-red-500 text-[11px] lg:text-[12px] 2xl:text-[13px]">{errors.phoneNumber.message}</span>}
                </div>

                {/* Password (New Field) */}
                <div className="flex flex-col gap-1.5 2xl:gap-2">
                    <label className="text-brand-body text-[13px] lg:text-[14px] 2xl:text-[15px] font-medium">Password</label>
                    <div className={`bg-brand-bg border rounded-[10px] lg:rounded-[12px] 2xl:rounded-[16px] px-3 lg:px-4 py-3 lg:py-3.5 2xl:py-4 flex items-center relative group/input transition-colors ${errors.password ? 'border-red-500' : 'border-brand-stroke'}`}>
                        <input
                            {...register("password")}
                            type={showPassword ? "text" : "password"}
                            placeholder="Create a password"
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

                    {/* Real-time Password Strength Visualizer */}
                    <div className="flex flex-col gap-1.5 mt-1">
                        <PasswordRequirement met={passwordValue.length >= 8} text="At least 8 characters" />
                        <PasswordRequirement met={/[A-Z]/.test(passwordValue)} text="At least 1 uppercase letter" />
                        <PasswordRequirement met={/[a-z]/.test(passwordValue)} text="At least 1 lowercase letter" />
                        <PasswordRequirement met={/[0-9]/.test(passwordValue)} text="At least 1 number" />
                        <PasswordRequirement met={/[^A-Za-z0-9]/.test(passwordValue)} text="At least 1 special character (@, #, !, etc.)" />
                    </div>
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
                    <div className="w-full h-full rounded-full flex items-center justify-center transition-opacity group-hover:opacity-90 bg-linear-to-r from-[#0035C1] to-[#0575FF]">
                        {isLoading ? (
                            <Loader2 className="w-4 h-4 lg:w-5 lg:h-5 2xl:w-6 2xl:h-6 animate-spin text-white" />
                        ) : (
                            <span className="text-brand-bg text-[14px] lg:text-[15px] 2xl:text-[18px] font-medium tracking-[-0.01em]">Create account</span>
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
                <div className="w-full">
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
                            Sign up with Google
                        </span>
                    </button>
                </div>

                {/* Login Link */}
                <div className="flex items-center gap-1.5 lg:gap-2 text-[13px] lg:text-[14px] 2xl:text-[15px]">
                    <span className="text-brand-body font-medium">Already have an account?</span>
                    <NextLink href={`/login${nextPath ? `?next=${nextPath}` : ''}`} className="text-brand-blue font-semibold hover:underline decoration-2 underline-offset-4">
                        Sign In
                    </NextLink>
                </div>
            </div>
        </div>
    );
};

const PasswordRequirement = ({ met, text }: { met: boolean; text: string }) => {
    return (
        <div className={`flex items-center gap-2 text-[11px] lg:text-[12px] 2xl:text-[13px] font-medium transition-colors duration-300 ${met ? "text-green-600" : "text-brand-mute"}`}>
            {met ? (
                <CheckCircle2 className="w-3.5 h-3.5 2xl:w-4 2xl:h-4" />
            ) : (
                <Circle className="w-3.5 h-3.5 2xl:w-4 2xl:h-4 text-brand-stroke" />
            )}
            <span>{text}</span>
        </div>
    );
};
