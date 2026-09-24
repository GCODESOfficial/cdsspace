import { TeamMemberDossier } from "@/components/hrm/TeamMemberDossier";

export default async function TeamMemberProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <TeamMemberDossier memberId={id} />;
}
