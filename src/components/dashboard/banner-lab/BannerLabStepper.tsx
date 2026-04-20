"use client";

import React from "react";
import { cn } from "@/lib/utils";
import { Step } from "./types";

interface StepperProps {
    currentStep: Step;
}

export const BannerLabStepper = ({ currentStep }: StepperProps) => {
    return (
        <div className="flex items-center justify-center gap-3 xl:gap-4 2xl:gap-6">
            {[1, 2, 3].map((s) => (
                <React.Fragment key={s}>
                    <div className={cn(
                        "size-8 xl:size-9 2xl:size-11 rounded-full flex items-center justify-center transition-all duration-500 border",
                        currentStep >= s ? "border-brand-blue" : "border-brand-stroke-ii"
                    )}>
                        <div className={cn(
                            "size-6 xl:size-7 2xl:size-8 rounded-full flex items-center justify-center transition-all duration-500",
                            currentStep >= s ? "bg-brand-blue shadow-lg shadow-brand-blue/20" : "bg-brand-stroke-ii opacity-40"
                        )}>
                            <div className="size-full rounded-full bg-white/20" />
                        </div>
                    </div>
                    {s < 3 && (
                        <div className={cn(
                            "h-px w-6 xl:w-8 2xl:w-16 transition-colors duration-500",
                            currentStep > s ? "bg-brand-blue" : "bg-brand-stroke-ii"
                        )} />
                    )}
                </React.Fragment>
            ))}
        </div>
    );
};
