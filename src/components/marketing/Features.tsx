import { Palette, Rocket, Target, Globe, Video } from "lucide-react";
import { SectionHeader } from "../shared/SectionHeader";

const features = [
    {
        title: "Brand Strategy",
        description: "Deep research and strategic positioning to ensure your brand resonates with the right audience.",
        icon: Target,
    },
    {
        title: "Brand Design",
        description: "Visual identities that are memorable, scalable, and beautifully crafted for the digital age.",
        icon: Palette,
    },
    {
        title: "Brand Marketing",
        description: "Multi-channel marketing strategies that amplify your voice and drive measurable growth.",
        icon: Rocket,
    },
];

const subFeatures = [
    {
        title: "Web and Apps",
        description: "High-performance digital experiences built with precision and a user-first approach.",
        icon: Globe,
    },
    {
        title: "Content Creation",
        description: "Compelling storytelling through video, photography, and digital content for modern platforms.",
        icon: Video,
    }
]

export const Features = () => {
    return (
        <section className="py-24 bg-brand-bg/50">
            <div className="section-container">
                <SectionHeader
                    badge="Services & Expertise"
                    title="What we bring to the table"
                    description="Every great brand deserves a strategic partner. We combine creativity with data to build lasting impressions."
                />

                <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                    {features.map((feature, index) => (
                        <div
                            key={feature.title}
                            className="p-10 rounded-[2.5rem] bg-white border border-brand-stroke hover:border-brand-blue/30 transition-all duration-500 hover:shadow-2xl hover:shadow-brand-blue/5 animate-reveal opacity-0"
                            style={{ animationDelay: `${0.2 + index * 0.1}s` }}
                        >
                            <div className="w-14 h-14 rounded-2xl bg-brand-bg flex items-center justify-center mb-8 border border-brand-stroke-ii">
                                <feature.icon className="w-7 h-7 text-brand-blue" />
                            </div>
                            <h3 className="text-2xl font-bold text-brand-navy mb-4 font-geist-sans">{feature.title}</h3>
                            <p className="text-brand-body leading-relaxed">{feature.description}</p>
                        </div>
                    ))}
                </div>

                <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-8">
                    {subFeatures.map((feature, index) => (
                        <div
                            key={feature.title}
                            className="p-10 rounded-[2.5rem] bg-white border border-brand-stroke hover:border-brand-blue/30 transition-all duration-500 hover:shadow-2xl hover:shadow-brand-blue/5 animate-reveal opacity-0"
                            style={{ animationDelay: `${0.5 + index * 0.1}s` }}
                        >
                            <div className="w-14 h-14 rounded-2xl bg-brand-bg flex items-center justify-center mb-8 border border-brand-stroke-ii">
                                <feature.icon className="w-7 h-7 text-brand-blue" />
                            </div>
                            <h3 className="text-2xl font-bold text-brand-navy mb-4 font-geist-sans">{feature.title}</h3>
                            <p className="text-brand-body leading-relaxed">{feature.description}</p>
                        </div>
                    ))}
                </div>
            </div>
        </section>
    );
};
