import Link from "next/link";
import { LegalList, LegalSection, LegalShell, LegalSubsection } from "@/components/legal/LegalShell";

// Public account and data deletion instructions. Google Play links here from
// the CDS Space store listing (Data safety: delete account URL and delete data
// URL, the latter pointing at #delete-data), so it must stay reachable without
// signing in and keep naming the app and developer as "CDS Space".

export const metadata = {
    title: "Delete your account or data - CDS Space",
    description:
        "How to close your CDS Space account or ask us to delete your personal data, what is deleted, and what we keep for legal reasons.",
    alternates: { canonical: "https://cdsspace.pro/delete-account" },
    openGraph: {
        title: "Delete your account or data - CDS Space",
        description: "How to close your CDS Space account or ask us to delete your personal data.",
        url: "https://cdsspace.pro/delete-account",
        type: "website",
    },
    robots: { index: true, follow: true },
};

const SUPPORT_EMAIL = "support@cdsspace.pro";
const accountMail = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent("Delete my CDS Space account")}`;
const dataMail = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent("Delete my CDS Space data")}`;

const linkClass = "font-semibold text-[#0A4FE8] hover:underline";

export default function DeleteAccountPage() {
    return (
        <LegalShell
            title="Delete your account or data"
            subtitle="How to close your CDS Space account, or ask us to delete some or all of your personal data without closing it."
            effectiveDate="3 October 2026"
        >
            <LegalSection id="delete-account" title="Delete your CDS Space account">
                <p>You can close your account yourself in the CDS Space app or on our website. Closing is permanent and signs you out on every device.</p>

                <LegalSubsection title="In the CDS Space app">
                    <ol className="list-decimal pl-6 flex flex-col gap-2">
                        <li>Sign in to the CDS Space app.</li>
                        <li>Open the Menu tab and tap Account Config.</li>
                        <li>Scroll to the bottom and tap Close account.</li>
                        <li>Confirm your email address, tell us why you are leaving, and enter the six-digit code we email to you.</li>
                    </ol>
                </LegalSubsection>

                <LegalSubsection title="On the website">
                    <ol className="list-decimal pl-6 flex flex-col gap-2">
                        <li>
                            Sign in at <Link href="/login" className={linkClass}>cdsspace.pro/login</Link>.
                        </li>
                        <li>Open Settings from your dashboard.</li>
                        <li>Under Close business account, select Close account and follow the same steps.</li>
                    </ol>
                </LegalSubsection>

                <LegalSubsection title="If you can no longer sign in">
                    <p>
                        Email <a href={accountMail} className={linkClass}>{SUPPORT_EMAIL}</a> from the address on your account with the subject
                        &quot;Delete my CDS Space account&quot;. We will confirm the request with you and close the account within 30 days.
                    </p>
                </LegalSubsection>
            </LegalSection>

            <LegalSection id="delete-data" title="Delete some or all of your data without closing your account">
                <p>
                    You can ask us to delete specific personal data, such as uploaded files, chat messages, your phone number or your profile photo,
                    and keep using your account.
                </p>
                <LegalList
                    items={[
                        <>
                            Email <a href={dataMail} className={linkClass}>{SUPPORT_EMAIL}</a> from the address on your account with the subject
                            &quot;Delete my CDS Space data&quot;.
                        </>,
                        "Tell us which data you want deleted. If you want all personal data deleted that we are not required to keep, say so.",
                        "We will confirm the request and complete it within 30 days, and tell you if any of it must be kept for the reasons below.",
                    ]}
                />
                <p>You can also edit or remove your name, phone number, company details and profile photo yourself in Account Config at any time.</p>
            </LegalSection>

            <LegalSection id="what-is-deleted" title="What is deleted and what we keep">
                <LegalSubsection title="When your account is closed">
                    <LegalList
                        items={[
                            "Your account is closed straight away. You are signed out of every device and can no longer sign in.",
                            "Your personal data is no longer used to provide the service and is deleted at the end of the retention periods below.",
                            "If you want personal data deleted sooner, email us as described above and we will delete everything we are not required to keep.",
                        ]}
                    />
                </LegalSubsection>

                <LegalSubsection title="Retention periods">
                    <LegalList
                        items={[
                            "Account data: up to 24 months after closure, to handle disputes and legal obligations, then deleted.",
                            "Payment, invoice and tax records: at least 6 years, as required by Nigerian tax law.",
                            "Project and creative files and signed agreements: for the engagement plus 7 years, for tax and contract records.",
                            "Server and security logs: up to 12 months, then aggregated or deleted.",
                        ]}
                    />
                </LegalSubsection>

                <p>
                    Kept records are stored securely, are used only for the purposes above, and are deleted at the end of the retention period. See
                    our <Link href="/privacy" className={linkClass}>Privacy Policy</Link> for full details.
                </p>
            </LegalSection>
        </LegalShell>
    );
}
