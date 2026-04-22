// Top-level categories for cDocs. "general" docs are the existing
// project / personal notes; "team_contract" is a separate bucket for HR
// templates that aren't tied to any client project.
export const CDOC_CATEGORIES = [
  { value: "general", label: "General" },
  { value: "project", label: "Projects" },
  { value: "team_contract", label: "Team Contracts" },
  { value: "contract", label: "Contracts" },
  { value: "client_brief", label: "Client Briefs" },
] as const;

export type CDocCategory = typeof CDOC_CATEGORIES[number]["value"];

// Subcategory templates per category. The list is fixed in the UI but the
// DB column accepts any string, so we can add presets here without a
// migration.
export const CDOC_SUBCATEGORIES: Record<string, { value: string; label: string; starter?: string }[]> = {
  general: [
    { value: "note", label: "Note" },
    { value: "brief", label: "Brief" },
    { value: "spec", label: "Spec" },
    { value: "memo", label: "Memo" },
  ],
  project: [
    { value: "project_brief", label: "Project Brief" },
    { value: "requirements", label: "Requirements" },
    { value: "design_spec", label: "Design Spec" },
    { value: "handoff", label: "Handoff Notes" },
    { value: "retrospective", label: "Retrospective" },
  ],
  contract: [
    { value: "msa", label: "Master Services Agreement" },
    { value: "sow", label: "Statement of Work" },
    { value: "amendment", label: "Amendment" },
    { value: "nda_client", label: "Client NDA" },
  ],
  client_brief: [
    { value: "kickoff", label: "Kickoff Brief" },
    { value: "creative_brief", label: "Creative Brief" },
    { value: "scope", label: "Scope Summary" },
    { value: "feedback", label: "Feedback Notes" },
  ],
  team_contract: [
    {
      value: "offer_letter",
      label: "Offer Letter",
      starter:
        `OFFER LETTER\n\nDate: \nCandidate: \nRole: \nStart date: \nCompensation: \n\nWe're excited to offer you the role of ___ at CDS Space. This letter outlines the key terms of your engagement.\n\nResponsibilities\n• \n\nCompensation & Benefits\n• \n\nReporting\n• \n\nNext Steps\nPlease sign below to accept this offer. We're looking forward to working with you.`,
    },
    {
      value: "employment_contract",
      label: "Employment Contract",
      starter:
        `EMPLOYMENT CONTRACT\n\nThis Employment Contract ("Agreement") is entered into between CDS Space ("Company") and ___ ("Employee") on ___.\n\n1. Position\n\n2. Term & Notice\n\n3. Compensation\n\n4. Confidentiality\n\n5. Termination\n\n6. Governing Law\n`,
    },
    {
      value: "contractor_agreement",
      label: "Contractor Agreement",
      starter:
        `INDEPENDENT CONTRACTOR AGREEMENT\n\nBetween CDS Space and ___ ("Contractor"), effective ___.\n\n1. Scope of Services\n\n2. Compensation\n\n3. Independent Contractor Status\n\n4. Intellectual Property\n\n5. Confidentiality\n\n6. Termination\n`,
    },
    {
      value: "ip_assignment",
      label: "IP Protection Agreement",
      starter:
        `INTELLECTUAL PROPERTY ASSIGNMENT\n\nThe undersigned ("Assignor") hereby assigns to CDS Space all right, title, and interest in any work product, inventions, designs, or other materials created in connection with their engagement.\n\n1. Definition of Work Product\n\n2. Assignment\n\n3. Moral Rights Waiver\n\n4. Pre-existing IP\n\n5. Further Assurances\n`,
    },
    {
      value: "nda",
      label: "NDA",
      starter:
        `NON-DISCLOSURE AGREEMENT\n\nBetween CDS Space and ___ ("Recipient"), effective ___.\n\n1. Confidential Information\n\n2. Permitted Use\n\n3. Term (___ years)\n\n4. Return of Materials\n\n5. Remedies\n`,
    },
    {
      value: "sow",
      label: "Statement of Work",
      starter:
        `STATEMENT OF WORK\n\nProject: \nClient / Internal Owner: \nStart: \nEnd: \n\n1. Scope\n\n2. Deliverables\n\n3. Timeline\n\n4. Pricing\n\n5. Acceptance Criteria\n`,
    },
    {
      value: "termination_letter",
      label: "Termination Letter",
      starter:
        `TERMINATION OF ENGAGEMENT\n\nDate: \nRecipient: \n\nThis letter confirms the end of your engagement with CDS Space effective ___.\n\nFinal compensation: \nReturn of materials: \nNon-disparagement & confidentiality reminder: \n\nWe wish you the best in your next chapter.`,
    },
  ],
};

export function findSubcategory(category: string, sub: string) {
  return CDOC_SUBCATEGORIES[category]?.find(s => s.value === sub) || null;
}

export function categoryLabel(value?: string | null): string {
  return CDOC_CATEGORIES.find(c => c.value === value)?.label || "General";
}
