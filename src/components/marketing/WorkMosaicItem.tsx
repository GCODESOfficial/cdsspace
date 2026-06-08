"use client";

import { ReactNode, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { getWorkMosaicClass, getWorkMosaicRowSpan, type WorkCoverShape } from "./work-cover-layout";

type WorkMosaicItemProps = {
    children: ReactNode;
    className?: string;
    gap?: number;
    minRowSpan?: number;
    rowHeight?: number;
    shape?: WorkCoverShape | null;
};

export function WorkMosaicItem({
    children,
    className,
    gap,
    minRowSpan,
    rowHeight,
    shape,
}: WorkMosaicItemProps) {
    const itemRef = useRef<HTMLDivElement>(null);
    const [width, setWidth] = useState(0);

    useEffect(() => {
        const item = itemRef.current;
        if (!item) return;

        const updateWidth = () => setWidth(item.getBoundingClientRect().width);
        updateWidth();

        if (typeof ResizeObserver === "undefined") {
            window.addEventListener("resize", updateWidth);
            return () => window.removeEventListener("resize", updateWidth);
        }

        const observer = new ResizeObserver(([entry]) => {
            setWidth(entry.contentRect.width);
        });

        observer.observe(item);
        return () => observer.disconnect();
    }, []);

    return (
        <div
            ref={itemRef}
            className={cn("min-h-0", getWorkMosaicClass(shape), className)}
            style={{ gridRowEnd: `span ${getWorkMosaicRowSpan(width, shape, { gap, minRowSpan, rowHeight })}` }}
        >
            {children}
        </div>
    );
}
