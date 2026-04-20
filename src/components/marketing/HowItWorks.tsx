import { SectionHeader } from "@/components/shared/SectionHeader";
import { CheckCircle2 } from "lucide-react";

const steps = [
    {
        number: "01",
        title: "Project Discovery",
        description: "We dive deep into your brand's mission, audience, and goals to build a solid foundation.",
    },
    {
        number: "02",
        title: "Strategic Blueprint",
        description: "A comprehensive roadmap detailing your visual identity and market entry strategy.",
    },
    {
        number: "03",
        title: "Design & Execution",
        description: "Our world-class designers bring the vision to life with precision and creativity.",
    },
];

export const HowItWorks = () => {
    return (
        <section className="py-24 overflow-hidden">
            <div className="section-container">
                <SectionHeader
                    badge="Our Process"
                    title="How we Work"
                    description="A streamlined, transparent approach to building high-impact brand identities."
                />

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
                    <div className="space-y-12">
                        {steps.map((step, index) => (
                            <div
                                key={step.number}
                                className="flex gap-8 group animate-reveal opacity-0"
                                style={{ animationDelay: `${0.2 + index * 0.1}s` }}
                            >
                                <div className="text-4xl font-black text-brand-blue/20 group-hover:text-brand-blue transition-colors duration-500 font-geist-mono">
                                    {step.number}
                                </div>
                                <div>
                                    <h3 className="text-2xl font-bold text-brand-navy mb-3">{step.title}</h3>
                                    <p className="text-brand-body leading-relaxed max-w-md">{step.description}</p>
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Interactive Preview Element */}
                    <div className="relative animate-reveal opacity-0" style={{ animationDelay: '0.5s' }}>
                        <div className="aspect-square rounded-[3rem] bg-brand-navy p-1 flex items-center justify-center overflow-hidden">
                            <div className="absolute inset-0 bg-gradient-to-br from-brand-blue/20 to-transparent" />
                            <div className="w-[85%] h-[85%] rounded-[2rem] bg-white shadow-2xl p-8 flex flex-col justify-between">
                                <div className="flex justify-between items-start">
                                    <div className="w-12 h-12 rounded-xl bg-brand-bg flex items-center justify-center">
                                        <CheckCircle2 className="w-6 h-6 text-brand-blue" />
                                    </div>
                                    <div className="px-3 py-1 rounded-full bg-brand-success/10 text-brand-success text-[10px] font-bold uppercase tracking-wider">
                                        Live Preview
                                    </div>
                                </div>
                                <div>
                                    <div className="h-4 w-2/3 bg-brand-bg rounded-full mb-4" />
                                    <div className="h-4 w-full bg-brand-bg rounded-full mb-4" />
                                    <div className="h-4 w-1/2 bg-brand-bg rounded-full" />
                                </div>
                                <div className="pt-6 border-t border-brand-stroke flex gap-3">
                                    <div className="w-10 h-10 rounded-full bg-brand-bg" />
                                    <div className="flex-1">
                                        <div className="h-3 w-1/3 bg-brand-bg rounded-full mb-2" />
                                        <div className="h-2 w-1/4 bg-brand-bg/50 rounded-full" />
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Floating Elements */}
                        <div className="absolute -right-8 -bottom-8 w-48 p-6 rounded-3xl bg-brand-blue text-white shadow-2xl hidden md:block">
                            <p className="text-xs font-bold uppercase tracking-widest opacity-70 mb-2">Success Rate</p>
                            <p className="text-3xl font-black font-geist-mono">98.5%</p>
                        </div>
                    </div>
                </div>
            </div>
        </section>
    );
};
