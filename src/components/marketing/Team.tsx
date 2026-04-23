"use client";

import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";
import { useEffect, useRef, useState } from "react";

interface SocialLinks {
    x?: string;
    facebook?: string;
    tiktok?: string;
    linkedin?: string;
    instagram?: string;
}

interface TeamMember {
    name: string;
    role: string;
    description: string;
    image: string;
    socials?: SocialLinks;
}

const teamMembers: TeamMember[] = [
    {
        name: "Chris John",
        role: "Chief Executive Officer",
        description: "Chief Executive Officer of CDS Space, leading brand and product direction. Focused on quality, clarity, and setting the standard.",
        image: "/about/Frame 2147238910-5.svg",
        socials: {
            x: "https://x.com/thechrisjohn_",
            facebook: "https://www.facebook.com/thechrisjohnn",
            tiktok: "https://www.tiktok.com/@thechrisjohn_",
            linkedin: "https://www.linkedin.com/in/thechrisjohn/",
        },
    },
    {
        name: "Lucy Monday",
        role: "Managing Director",
        description: "Lucy leads the agency with a focus on vision and operational excellence. She ensures we stay true to our mission while scaling our impact globally.",
        image: "/about/lucy.png",
        socials: {
            linkedin: "https://www.linkedin.com/in/lucy-monday-705711190/",
            facebook: "https://www.facebook.com/monday.lucy.3",
        },
    },
    {
        name: "Ayomide Ajayi",
        role: "Creative Director",
        description: "Ayomide leads brand and product design across Web2 and Web3. Focused on quality, clarity, and getting it right.",
        image: "/about/Frame 2147238910-3.svg",
        socials: { x: "https://x.com/crowther_a3" },
    },
    {
        name: "Honest Ernest",
        role: "Product Manager",
        description: "Honest focuses on product clarity and outcomes. Moves fast with clear direction, slows on key decisions. Obsessed with details.",
        image: "/about/Frame 2147238910-2.svg",
        socials: { x: "https://x.com/oneststyles" },
    },
    {
        name: "Godsgift Etuk",
        role: "Chief Software Developer",
        description: "Godsgift leads the technical implementation, ensuring every pixel-perfect design is matched by robust, high-performance code.",
        image: "/about/Frame 2147238910-1.svg",
        socials: { x: "https://x.com/GCODES_official" },
    },
    {
        name: "Edidiong Esuene",
        role: "Account Manager",
        description: "Edidiong manages the agency's financial health and client accounts. She ensures every project remains profitable and balanced. Focused on the numbers.",
        image: "/about/Frame 2147238910-4.svg",
    },
    {
        name: "Emediong John",
        role: "Human Resource Manager",
        description: "Emediong focuses on building the right team and supporting people. Handles hiring and growth. Sometimes too focused on well-being.",
        image: "/about/Frame 2147238910.svg",
        socials: { x: "https://x.com/Johnemedion" },
    }
];

export const Team = () => {
    return (
        <section className="bg-brand-bg py-24 md:py-32 px-6 overflow-hidden pb-20!">
            <div className="max-w-[1240px] mx-auto flex flex-col items-center">

                {/* Header Section - Node 5929:10313 */}
                <div className="text-center mb-16 md:mb-20 max-w-[784px] mx-auto">
                    <h2 className="text-[#040B37] text-[40px] md:text-[56px] font-semibold tracking-[-1.12px] mb-4">
                        Meet the team
                    </h2>
                    <p className="text-[#4B5563] text-lg md:text-[18px] font-medium tracking-[-0.18px] max-w-[512px] mx-auto">
                        Designers, thinkers, and collaborators shaping every project.
                    </p>
                </div>

                {/* Team Grid (Desktop) / Scroll (Mobile) - Node 5971:1426 */}
                <div className="w-full max-w-[996px]">
                    <div className="flex md:grid md:grid-cols-3 gap-5 overflow-x-auto md:overflow-visible pb-8 md:pb-0 snap-x snap-mandatory scrollbar-hide px-4 md:px-0">
                        {teamMembers.map((member, index) => (
                            <TeamCard key={member.name} member={member} index={index} />
                        ))}
                    </div>
                </div>
            </div>
        </section>
    );
};

const TeamCard = ({ member, index }: { member: TeamMember, index: number }) => {
    const [isHovered, setIsHovered] = useState(false);

    return (
        <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: index * 0.1 }}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
            className="flex-shrink-0 w-[318.667px] h-[400px] snap-center relative"
        >
            <div className="w-full h-full bg-white rounded-[24px] overflow-hidden flex flex-col relative border border-[#C8D1E0] shadow-sm transition-all duration-300">

                {/* Profile Image & Gradient - Node 5992:1477 etc */}
                <div className="flex-grow w-full relative bg-white overflow-hidden">
                    {/* Background Gradient - Node 5992:1525 style */}
                    <div className="absolute inset-0 bg-gradient-to-t from-[#5BA8FF] via-white/20 to-white z-0" />

                    <div className="absolute inset-0 z-10 flex items-end justify-center">
                        {member.image === "placeholder-female" ? (
                            <div className="w-full h-full flex items-center justify-center bg-[#F4F6FB] rounded-full">
                                <svg width="120" height="120" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="text-[#C8D1E0]">
                                    <path d="M12 12C14.7614 12 17 9.76142 17 7C17 4.23858 14.7614 2 12 2C9.23858 2 7 4.23858 7 7C7 9.76142 9.23858 12 12 12Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                                    <path d="M19.2151 20.25C19.2151 17.3505 15.9846 15 12.0001 15C8.01554 15 4.78516 17.3505 4.78516 20.25" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                                    <path d="M12 15V13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                                    <path d="M8 8C8 8 9 9 12 9C15 9 16 8 16 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                                </svg>
                            </div>
                        ) : (
                            // object-contain + bottom anchor so the subject's head stays fully
                            // inside the card on narrow mobile widths (was object-cover object-top
                            // which cropped the forehead on portrait sources). High quality +
                            // explicit sizes keep the face crisp on retina mobile.
                            <Image
                                src={member.image}
                                alt={member.name}
                                fill
                                priority={index < 3}
                                quality={95}
                                sizes="(max-width: 768px) 90vw, (max-width: 1024px) 45vw, 320px"
                                className="object-contain object-bottom transition-transform duration-700 group-hover:scale-105"
                            />
                        )}
                    </div>

                    {/* Desktop Hover Bio Overlay */}
                    <AnimatePresence>
                        {isHovered && (
                            <motion.div
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                className="absolute inset-0 z-30 bg-white/95 p-8 flex flex-col items-center justify-center text-center hidden md:flex backdrop-blur-sm px-10"
                            >
                                <p className="text-[#4B5563] text-base font-medium leading-[1.6] tracking-[-0.16px]">
                                    {member.description}
                                </p>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>

                {/* Bottom Info - Node 5992:1526 */}
                <div className="bg-white px-[24px] py-[16px] flex items-center justify-between relative z-40 border-t border-[#F4F6FB]">
                    <div className="flex flex-col gap-[4px]">
                        <h3 className="text-[#040B37] text-[20px] font-medium tracking-[-0.8px] leading-[1.24]">
                            {member.name}
                        </h3>
                        <p className="text-[#4B5563] text-[16px] font-medium tracking-[-0.16px]">
                            {member.role}
                        </p>
                    </div>

                    {/* Social popover — clicking opens all configured socials */}
                    {member.socials && hasAnySocial(member.socials) && (
                        <SocialButton socials={member.socials} name={member.name} />
                    )}
                </div>

                {/* Mobile Meta (Always visible for scroll) */}
                <div className="md:hidden px-6 pb-4 bg-white">
                    <p className="text-[#4B5563] text-[14px] leading-[1.5] tracking-tight line-clamp-2">
                        {member.description}
                    </p>
                </div>
            </div>
        </motion.div>
    );
};

/* ------------------------------------------------------------------ */
/*  Social popover                                                     */
/* ------------------------------------------------------------------ */

function hasAnySocial(s: SocialLinks) {
    return Boolean(s.x || s.facebook || s.tiktok || s.linkedin || s.instagram);
}

type SocialKey = keyof SocialLinks;

const SOCIAL_ORDER: SocialKey[] = ["x", "facebook", "tiktok", "linkedin", "instagram"];

const SOCIAL_LABEL: Record<SocialKey, string> = {
    x: "X (Twitter)",
    facebook: "Facebook",
    tiktok: "TikTok",
    linkedin: "LinkedIn",
    instagram: "Instagram",
};

const SocialButton = ({ socials, name }: { socials: SocialLinks; name: string }) => {
    const [open, setOpen] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);

    // Click outside + Escape to close
    useEffect(() => {
        if (!open) return;
        function onDoc(e: MouseEvent) {
            if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
        }
        function onKey(e: KeyboardEvent) {
            if (e.key === "Escape") setOpen(false);
        }
        document.addEventListener("mousedown", onDoc);
        document.addEventListener("keydown", onKey);
        return () => {
            document.removeEventListener("mousedown", onDoc);
            document.removeEventListener("keydown", onKey);
        };
    }, [open]);

    const entries = SOCIAL_ORDER
        .filter((key) => socials[key])
        .map((key) => ({ key, url: socials[key]! }));

    return (
        <div ref={containerRef} className="relative shrink-0">
            <motion.button
                type="button"
                onClick={() => setOpen((v) => !v)}
                whileHover={{ scale: 1.05 }}
                aria-haspopup="menu"
                aria-expanded={open}
                aria-label={`${name} social links`}
                className="w-[40px] h-[40px] rounded-[10px] bg-[#F4F6FB] border border-[#C8D1E0] flex items-center justify-center text-[#040B37] transition-colors hover:border-[#040B37]"
            >
                <SocialIcon name="x" className="w-5 h-5" />
            </motion.button>

            <AnimatePresence>
                {open && (
                    <motion.div
                        role="menu"
                        initial={{ opacity: 0, y: 8, scale: 0.96 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 8, scale: 0.96 }}
                        transition={{ duration: 0.15 }}
                        className="absolute bottom-[calc(100%+8px)] right-0 z-50 bg-white border border-[#C8D1E0] rounded-2xl shadow-[0_16px_40px_rgba(4,11,55,0.14)] p-2 flex items-center gap-1.5"
                    >
                        {entries.map(({ key, url }) => (
                            <a
                                key={key}
                                href={url}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={() => setOpen(false)}
                                title={SOCIAL_LABEL[key]}
                                aria-label={`${name} on ${SOCIAL_LABEL[key]}`}
                                className="w-9 h-9 rounded-lg flex items-center justify-center text-[#040B37] hover:bg-[#F4F6FB] transition-colors"
                            >
                                <SocialIcon name={key} className="w-[18px] h-[18px]" />
                            </a>
                        ))}
                        {/* Tiny arrow */}
                        <span className="absolute -bottom-1.5 right-5 w-3 h-3 rotate-45 bg-white border-b border-r border-[#C8D1E0]" />
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

/* ------------------------------------------------------------------ */
/*  Social icons                                                       */
/* ------------------------------------------------------------------ */

function SocialIcon({ name, className }: { name: SocialKey; className?: string }) {
    switch (name) {
        case "x":
            return (
                <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
                    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.045 4.126H5.078z" />
                </svg>
            );
        case "facebook":
            return (
                <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
                    <path d="M13.5 21.945V13.69h2.78l.41-3.23h-3.19V8.4c0-.93.26-1.57 1.6-1.57h1.7V3.94c-.3-.04-1.32-.13-2.5-.13-2.47 0-4.17 1.51-4.17 4.28v2.37H7.35v3.23h2.78v8.255c.63.11 1.28.17 1.95.17.68 0 1.33-.06 1.96-.17z" />
                </svg>
            );
        case "tiktok":
            return (
                <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
                    <path d="M16.6 5.82a4.47 4.47 0 0 1-2.34-1.4 4.47 4.47 0 0 1-1.03-2.42h-2.88v11.99a2.61 2.61 0 0 1-5.22.13 2.61 2.61 0 0 1 3.29-2.65V8.51a5.53 5.53 0 0 0-6.2 5.49 5.53 5.53 0 1 0 11.06 0V8.66a7.35 7.35 0 0 0 4.33 1.4V7.18a4.4 4.4 0 0 1-1.01-1.36z" />
                </svg>
            );
        case "linkedin":
            return (
                <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
                    <path d="M20.45 20.45h-3.56v-5.57c0-1.33-.02-3.05-1.86-3.05-1.86 0-2.14 1.45-2.14 2.95v5.67H9.33V9h3.41v1.56h.05a3.74 3.74 0 0 1 3.37-1.85c3.6 0 4.27 2.37 4.27 5.45v6.29zM5.34 7.43a2.06 2.06 0 1 1 0-4.12 2.06 2.06 0 0 1 0 4.12zM7.12 20.45H3.56V9h3.56v11.45zM22.23 0H1.77C.79 0 0 .77 0 1.72v20.56C0 23.23.79 24 1.77 24h20.46c.98 0 1.77-.77 1.77-1.72V1.72C24 .77 23.21 0 22.23 0z" />
                </svg>
            );
        case "instagram":
            return (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
                    <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
                    <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
                    <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" />
                </svg>
            );
    }
}
