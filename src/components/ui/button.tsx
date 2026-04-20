import * as React from "react";
import { cn } from "@/lib/utils";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: "primary" | "outline" | "ghost" | "white";
    size?: "sm" | "md" | "lg";
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
    ({ className, variant = "primary", size = "md", ...props }, ref) => {
        const variants = {
            primary: "bg-brand-blue text-white hover:bg-brand-blue/90",
            outline: "border-2 border-brand-blue text-brand-blue hover:bg-brand-blue/5",
            ghost: "text-brand-blue hover:bg-brand-blue/5",
            white: "bg-white text-brand-navy hover:bg-brand-white",
        };

        const sizes = {
            sm: "px-4 py-2 text-sm",
            md: "px-8 py-3 text-base font-semibold",
            lg: "px-10 py-4 text-lg font-bold",
        };

        return (
            <button
                ref={ref}
                className={cn(
                    "inline-flex items-center justify-center rounded-full transition-all duration-300 disabled:opacity-50 disabled:pointer-events-none active:scale-95",
                    variants[variant],
                    sizes[size],
                    className
                )}
                {...props}
            />
        );
    }
);

Button.displayName = "Button";
