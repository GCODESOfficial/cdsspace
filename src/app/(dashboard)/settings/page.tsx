import { redirect } from "next/navigation";

export default function LegacyClientSettingsPage() {
  redirect("/dashboard/settings");
}
