import { cn } from "@/lib/utils";

interface SectionHeaderProps {
    badge?: string;
    title: string;
    description?: string;
    align?: "left" | "center";
    className?: string;
}

export const SectionHeader = ({
    badge,
    title,
    description,
    align = "center",
    className,
}: SectionHeaderProps) => {
    return (
        <div
            className={cn(
                "flex flex-col mb-16 animate-reveal opacity-0",
                align === "center" ? "items-center text-center" : "items-start text-left",
                className
            )}
        >
            {badge && (
                <span className="text-brand-blue font-bold uppercase tracking-widest text-[10px] mb-4">
                    {badge}
                </span>
            )}
            <h2 className="text-3xl md:text-5xl font-bold text-brand-navy leading-tight max-w-2xl">
                {title}
            </h2>
            {description && (
                <p className="mt-6 text-brand-body text-balance max-w-2xl leading-relaxed">
                    {description}
                </p>
            )}
        </div>
    );
};
