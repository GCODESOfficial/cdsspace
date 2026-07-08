"use client";

import { type ReactNode, useEffect, useRef, useState } from "react";

interface LazySectionProps {
    children: ReactNode;
    className?: string;
    minHeight?: number;
    rootMargin?: string;
}

export function LazySection({
    children,
    className,
    minHeight = 640,
    rootMargin = "900px 0px",
}: LazySectionProps) {
    const ref = useRef<HTMLDivElement>(null);
    const [active, setActive] = useState(false);

    useEffect(() => {
        if (active) return;
        if (typeof IntersectionObserver === "undefined") {
            setActive(true);
            return;
        }

        const observer = new IntersectionObserver(
            ([entry]) => {
                if (!entry.isIntersecting) return;
                setActive(true);
                observer.disconnect();
            },
            { rootMargin },
        );

        const node = ref.current;
        if (node) observer.observe(node);
        return () => observer.disconnect();
    }, [active, rootMargin]);

    return (
        <div ref={ref} className={className} style={active ? undefined : { minHeight }}>
            {active ? children : null}
        </div>
    );
}
