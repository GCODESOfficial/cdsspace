import { redirect } from "next/navigation";

export const metadata = {
    title: "Brand Marketers | CDS Space",
    description: "The CDS Space Brand Marketer programme now has a dedicated portal.",
};

export default function PartnershipPage() {
    redirect("/marketer");
}
