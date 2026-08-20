import { redirect } from "next/navigation";
import { MarketerAuthForm } from "@/components/marketer/MarketerAuthForm";
import { getMarketerAccountState } from "@/lib/marketer-account";

export const metadata = {
  title: "Sign in | CDS Space Brand Marketers",
  alternates: { canonical: "https://cdsspace.pro/marketer/login" },
};
export const dynamic = "force-dynamic";

export default async function MarketerLoginPage() {
  const account = await getMarketerAccountState();
  if (account) redirect("/marketer");
  return <MarketerAuthForm />;
}
