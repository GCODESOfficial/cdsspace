"use client";

import { useCallback, useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import NextLink from "next/link";
import { Eye, EyeOff, Loader2, CheckCircle2, Circle } from "lucide-react";
import { signupSchema, type SignupInput } from "@/lib/validations/auth";
import { resendClientSignupVerification, signup, verifyClientSignupCode } from "@/lib/actions/auth";
import { EmailConfirmationModal } from "./EmailConfirmationModal";
import { GoogleAuthButton } from "./GoogleAuthButton";
import { LinkedInAuthButton } from "./LinkedInAuthButton";
import { PhoneInput } from "@/components/shared/PhoneInput";
import { BotCheck } from "@/components/security/BotCheck";

/**
 * SignUpForm - 1:1 Figma Implementation with real Supabase logic.
 */
export const SignUpForm = ({
    nextPath,
    invitedEmail,
    clientInvite,
}: {
    nextPath: string;
    invitedEmail: string;
    clientInvite: string | null;
}) => {
    const [showPassword, setShowPassword] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [isSuccess, setIsSuccess] = useState(false);
    const [userEmail, setUserEmail] = useState("");
    const [botToken, setBotToken] = useState("");
    const [botResetSignal, setBotResetSignal] = useState(0);
    const [resendInSeconds, setResendInSeconds] = useState(60);
    const onBotTokenChange = useCallback((token: string) => setBotToken(token), []);
    const router = useRouter();
    const loginHref = `/login?next=${encodeURIComponent(nextPath)}`;

    const {
        register,
        handleSubmit,
        control,
        watch,
        formState: { errors },
    } = useForm<SignupInput>({
        resolver: zodResolver(signupSchema),
        defaultValues: { email: invitedEmail },
    });

    const passwordValue = watch("password") || "";

    const onSubmit = async (data: SignupInput) => {
        if (!botToken) {
            setError("Complete the security verification before creating your account.");
            return;
        }
        setIsLoading(true);
        setError(null);
        setUserEmail(data.email);
        try {
            const result = await signup({ ...data, next: nextPath, clientInvite, botToken });
            if (result?.error) {
                setError(result.error);
                setBotToken("");
                setBotResetSignal((value) => value + 1);
            } else {
                setResendInSeconds(result.resendInSeconds || 60);
                setIsSuccess(true);
            }
        } catch (e) {
            setError("Something went wrong. Please try again.");
            setBotToken("");
            setBotResetSignal((value) => value + 1);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="w-full flex flex-col gap-6 lg:gap-8 xl:gap-[32px] 2xl:gap-[40px]">
            <EmailConfirmationModal
                isOpen={isSuccess}
                onClose={() => {
                    setIsSuccess(false);
                    router.push(loginHref);
                }}
                email={userEmail}
                initialResendSeconds={resendInSeconds}
                onResend={() => resendClientSignupVerification({ email: userEmail, next: nextPath })}
                onVerify={async (code) => {
                    const result = await verifyClientSignupCode({ email: userEmail, code, next: nextPath });
                    if (result.success && result.next) router.push(result.next);
                    return result;
                }}
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
                            style={{ borderRadius: "inherit" }}
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
                            readOnly={Boolean(clientInvite && invitedEmail)}
                            disabled={isLoading}
                            style={{ borderRadius: "inherit" }}
                            className="w-full bg-transparent outline-none text-brand-navy text-[13px] lg:text-[14px] 2xl:text-[15px] font-medium placeholder:text-brand-mute disabled:opacity-50"
                        />
                    </div>
                    {errors.email && <span className="text-red-500 text-[11px] lg:text-[12px] 2xl:text-[13px]">{errors.email.message}</span>}
                    {clientInvite && invitedEmail && <span className="text-[11px] font-medium text-brand-blue">Invitation email confirmed. This account will be linked to your client record.</span>}
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
                            style={{ borderRadius: "inherit" }}
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
                            style={{ borderRadius: "inherit" }}
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

                <BotCheck action="client_signup" onTokenChange={onBotTokenChange} resetSignal={botResetSignal} />

                {/* CTA Button */}
                <button
                    type="submit"
                    disabled={isLoading || !botToken}
                    className="w-full h-[40px] lg:h-[48px] 2xl:h-[56px] rounded-full p-[2px] bg-brand-bg border border-[#648EFC] shadow-[0_4px_8px_rgba(0,0,0,0.04)] group overflow-hidden disabled:opacity-70 disabled:cursor-not-allowed"
                >
                    <div style={{ borderRadius: "inherit" }} className="w-full h-full flex items-center justify-center transition-opacity group-hover:opacity-90 bg-[#0A4FE8]">
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

                {/* Social sign-in */}
                {clientInvite ? (
                    <p className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-center text-xs font-medium text-brand-blue">
                        Complete this invitation with the confirmed email form above so your project files attach to the correct client record.
                    </p>
                ) : (
                    <div className="w-full flex flex-col gap-2.5 lg:gap-3">
                        <GoogleAuthButton label="Sign up with Google" />
                        <LinkedInAuthButton label="Sign up with LinkedIn" />
                    </div>
                )}

                {/* Login Link */}
                <div className="flex items-center gap-1.5 lg:gap-2 text-[13px] lg:text-[14px] 2xl:text-[15px]">
                    <span className="text-brand-body font-medium">Already have an account?</span>
                    <NextLink href={loginHref} className="text-brand-blue font-semibold hover:underline decoration-2 underline-offset-4">
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
