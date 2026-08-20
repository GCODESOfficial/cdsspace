import * as React from "react";
import { cn } from "@/lib/utils";

type ButtonVariant = "primary" | "outline" | "ghost" | "white";
type ButtonSize = "sm" | "md" | "lg";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: ButtonVariant;
    size?: ButtonSize;
}

const variants: Record<ButtonVariant, string> = {
    primary: "border border-transparent bg-brand-blue text-white shadow-[0_8px_20px_rgba(10,79,232,0.18)] hover:bg-[#083EC0] hover:shadow-[0_10px_24px_rgba(10,79,232,0.24)]",
    outline: "border border-brand-stroke bg-white text-brand-navy shadow-sm hover:border-brand-blue/30 hover:bg-blue-50 hover:text-brand-blue",
    ghost: "border border-transparent text-brand-body hover:bg-blue-50 hover:text-brand-blue",
    white: "border border-brand-stroke bg-white text-brand-navy shadow-sm hover:border-brand-blue/25 hover:bg-blue-50",
};

const sizes: Record<ButtonSize, string> = {
    sm: "min-h-10 px-3.5 py-2 text-[13px] sm:px-4",
    md: "min-h-11 px-5 py-2.5 text-sm font-semibold sm:px-6",
    lg: "min-h-12 px-6 py-3 text-base font-bold sm:px-8",
};

const buttonBase =
    "inline-flex max-w-full min-w-0 items-center justify-center gap-2 whitespace-normal rounded-xl text-center leading-tight transition-all duration-200 disabled:pointer-events-none disabled:opacity-50 active:scale-[0.98]";

export function buttonVariants({
    variant = "primary",
    size = "md",
}: {
    variant?: ButtonVariant;
    size?: ButtonSize;
} = {}) {
    return cn(buttonBase, variants[variant], sizes[size]);
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
    ({ className, variant = "primary", size = "md", ...props }, ref) => {
        return (
            <button
                ref={ref}
                className={cn(
                    buttonVariants({ variant, size }),
                    className
                )}
                {...props}
            />
        );
    }
);

Button.displayName = "Button";
