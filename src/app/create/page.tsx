import { CreateApp } from "@/components/create/CreateApp";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "CREATE by CDS Space",
  description: "Professional creative tools powered by CDS Space.",
};

export default function CreatePage() {
  return <CreateApp />;
}
