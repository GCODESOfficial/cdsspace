import { SectionHeader } from "@/components/shared/SectionHeader";
import { Button } from "@/components/ui/button";

const projects = [
    {
        title: "EcoSphere Digital",
        category: "Branding & Web",
        image: "/api/placeholder/600/800",
        span: "md:row-span-2",
    },
    {
        title: "Nova Ventures",
        category: "Corporate Identity",
        image: "/api/placeholder/600/400",
        span: "md:col-span-1",
    },
    {
        title: "Pulse Social",
        category: "Marketing Campaign",
        image: "/api/placeholder/600/400",
        span: "md:col-span-1",
    },
    {
        title: "Zephyr App",
        category: "Product Design",
        image: "/api/placeholder/600/400",
        span: "md:col-span-1",
    },
    {
        title: "Aurora Analytics",
        category: "SaaS Platform",
        image: "/api/placeholder/800/600",
        span: "md:col-span-1",
    }
];

export const Showcase = () => {
    return (
        <section className="py-24 bg-white">
            <div className="section-container">
                <div className="flex flex-col md:flex-row justify-between items-end gap-8 mb-16">
                    <SectionHeader
                        badge="Our Work"
                        title="See what we've built"
                        description="A selection of our latest projects across branding, digital strategy, and product design."
                        align="left"
                        className="mb-0"
                    />
                    <Button variant="outline" className="hidden md:flex">View all projects</Button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 auto-rows-[250px]">
                    {projects.map((project, index) => (
                        <div
                            key={project.title}
                            className={`group relative rounded-[2.5rem] overflow-hidden bg-brand-bg transition-all duration-700 hover:shadow-2xl hover:-translate-y-2 animate-reveal opacity-0 ${project.span}`}
                            style={{ animationDelay: `${0.2 + index * 0.1}s` }}
                        >
                            <img
                                src={project.image}
                                alt={project.title}
                                className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
                            />
                            <div className="absolute inset-0 bg-gradient-to-t from-brand-navy/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 flex flex-col justify-end p-10">
                                <p className="text-brand-blue font-bold text-xs uppercase tracking-widest mb-2">{project.category}</p>
                                <h3 className="text-white text-2xl font-bold">{project.title}</h3>
                            </div>
                        </div>
                    ))}
                </div>

                <div className="mt-12 text-center md:hidden">
                    <Button variant="outline" className="w-full">View all projects</Button>
                </div>
            </div>
        </section>
    );
};
