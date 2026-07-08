/**
 * Seed content for the Privacy Policy and Terms of Service.
 *
 * Used by:
 *  - the public /privacy and /terms pages as a fallback when no row exists
 *    in the `legal_documents` table yet;
 *  - the admin "Initialize with default content" action.
 *
 * The HTML is intentionally plain - no Tailwind classes on the inner markup.
 * Styling lives in `.legal-prose` (globals.css). This keeps the round-trip
 * through Microsoft Word / Google Docs clean, because Word writes its own
 * formatting and `mammoth` strips unknown classes on upload.
 */

export interface DefaultLegalDoc {
    slug: "privacy" | "terms";
    title: string;
    subtitle: string;
    effective_date: string;
    content: string;
}

const PRIVACY_CONTENT = `
<h2 id="controller">1. Who We Are</h2>
<p>CDS Space (&ldquo;<strong>CDS Space</strong>&rdquo;, &ldquo;<strong>we</strong>&rdquo;, &ldquo;<strong>us</strong>&rdquo;, &ldquo;<strong>our</strong>&rdquo;) is a branding, design, and digital production studio operating from Nigeria and serving clients globally. For the purposes of the Nigeria Data Protection Act, 2023 (&ldquo;<strong>NDPA</strong>&rdquo;), the EU/UK General Data Protection Regulation (&ldquo;<strong>GDPR</strong>&rdquo;), Rwanda Law No. 058/2021, the California Consumer Privacy Act/California Privacy Rights Act (&ldquo;<strong>CCPA/CPRA</strong>&rdquo;), and the Personal Information Protection Law of the People&rsquo;s Republic of China (&ldquo;<strong>PIPL</strong>&rdquo;), we are the <strong>Data Controller</strong> of personal data processed through our websites and services.</p>
<p><strong>Contact (controller &amp; data protection enquiries):</strong><br/>Email: <a href="mailto:support@cdsspace.pro">support@cdsspace.pro</a></p>

<h2 id="scope">2. Scope of This Policy</h2>
<p>This Policy applies to all users of the CDS Space websites, client dashboards, staff admin portal, invoicing tools, contractor onboarding forms, and any related services (collectively, the &ldquo;<strong>Services</strong>&rdquo;). It is drafted to comply primarily with Nigerian law and is adapted to meet the core obligations of data-protection regimes in Rwanda, the United Kingdom, the European Union, the United States (including California), and the People&rsquo;s Republic of China. Where a specific jurisdiction grants you stronger rights than those described here, that higher standard applies to you.</p>

<h2 id="data">3. Personal Data We Collect</h2>
<h3>3.1 Data you provide directly</h3>
<ul>
  <li><strong>Account data</strong> - full name, email address, password (hashed), phone number, company name, country.</li>
  <li><strong>Profile data</strong> - avatar, job title, billing address, business description.</li>
  <li><strong>Project data</strong> - briefs, creative assets, files, brand words, messages you send through our chat or support channels.</li>
  <li><strong>Payment data</strong> - billing details processed through our payment providers. We do not store full card numbers on our servers.</li>
  <li><strong>Career / contractor data</strong> - CV, portfolio links, work history, identification documents submitted when applying to join us.</li>
</ul>
<h3>3.2 Data collected automatically</h3>
<ul>
  <li><strong>Device &amp; usage data</strong> - IP address, browser type, device identifiers, pages viewed, referring URL, timestamps.</li>
  <li><strong>Cookies and similar technologies</strong> - session cookies, authentication tokens (GlashDB-compatible <code>sb-*</code> cookies, our <code>cds_oauth_*</code> cookies), and limited analytics cookies. See Section 10.</li>
  <li><strong>Log data</strong> - error logs, security events, and API request logs.</li>
</ul>
<h3>3.3 Data from third parties</h3>
<ul>
  <li><strong>Google Sign-In</strong> - when you sign in with Google, we receive your name, email, Google account ID, and profile picture. We do not receive your Google password.</li>
  <li><strong>Payment processors</strong> - transaction reference, payment status, and limited billing identifiers.</li>
  <li><strong>Public sources</strong> - for business-to-business outreach, we may process publicly available professional contact information.</li>
</ul>
<p>We do <strong>not</strong> intentionally collect sensitive personal data (health, religion, political views, biometric data) unless you voluntarily share it in connection with a project, and we do not require it to provide the Services.</p>

<h2 id="purposes">4. Why We Use Your Data (Purposes &amp; Legal Bases)</h2>
<p>Under the NDPA, GDPR, Rwanda&rsquo;s data protection law, and PIPL, we must have a valid legal basis for every processing activity.</p>
<table>
  <thead>
    <tr><th>Purpose</th><th>Legal basis</th></tr>
  </thead>
  <tbody>
    <tr><td>Create and manage your account; authenticate you.</td><td>Performance of a contract; consent (for Google Sign-In).</td></tr>
    <tr><td>Deliver branding, design, web, and print services you order.</td><td>Performance of a contract.</td></tr>
    <tr><td>Process payments, issue invoices, and keep tax records.</td><td>Legal obligation (tax and anti-money-laundering laws); contract performance.</td></tr>
    <tr><td>Customer support and in-app chat.</td><td>Contract performance; legitimate interests.</td></tr>
    <tr><td>Protect the Services against fraud, abuse, and security incidents.</td><td>Legitimate interests; legal obligation.</td></tr>
    <tr><td>Send service emails (receipts, updates, security alerts).</td><td>Contract performance; legitimate interests.</td></tr>
    <tr><td>Send marketing emails about our work and offers.</td><td>Consent (you can withdraw at any time).</td></tr>
    <tr><td>Review career and contractor applications.</td><td>Steps prior to entering into a contract; consent.</td></tr>
  </tbody>
</table>
<p>For users in China, where PIPL requires separate consent for specific processing activities (such as cross-border transfers and the processing of sensitive personal information), we obtain that consent through distinct in-product prompts.</p>

<h2 id="sharing">5. Who We Share Data With</h2>
<p>We do <strong>not</strong> sell your personal data. We share it only with the categories of recipients below, and only to the extent needed for the purposes in Section 4:</p>
<ul>
  <li><strong>Service providers (processors)</strong> - hosting and infrastructure (Vercel Inc., USA), database and authentication (GlashDB), Google OAuth (Google LLC, USA), email delivery (Google Workspace / SMTP), file storage, and analytics providers.</li>
  <li><strong>Payment processors</strong> - to take payment and refund transactions.</li>
  <li><strong>Professional advisors</strong> - accountants, auditors, and lawyers, under duties of confidentiality.</li>
  <li><strong>Authorities</strong> - where required by a valid legal request under Nigerian law or another applicable jurisdiction (for example, the Nigeria Data Protection Commission, tax authorities, or a court).</li>
  <li><strong>Corporate transactions</strong> - in connection with a merger, acquisition, or sale of assets, subject to equivalent protection of your data.</li>
</ul>
<p>Every processor is bound by a written data-processing agreement that obliges them to process your data only on our instructions and to keep it secure.</p>

<h2 id="transfers">6. International Data Transfers</h2>
<p>CDS Space is based in Nigeria. Our infrastructure providers are primarily located in the United States and the European Union. This means your data may be transferred to, and processed in, countries outside your country of residence.</p>
<ul>
  <li><strong>From Nigeria (NDPA):</strong> transfers are made only to jurisdictions that provide an adequate level of protection, or under appropriate safeguards (standard contractual clauses, binding corporate rules, or your explicit consent).</li>
  <li><strong>From the EU and UK (GDPR / UK GDPR):</strong> we rely on European Commission / UK adequacy decisions where available, and on UK IDTA or EU Standard Contractual Clauses (2021) for other transfers.</li>
  <li><strong>From Rwanda (Law No. 058/2021):</strong> transfers are made with the prior authorisation of the National Cyber Security Authority where required, or under appropriate safeguards.</li>
  <li><strong>From China (PIPL):</strong> we obtain your separate consent for cross-border transfers and, where applicable, conduct a Personal Information Protection Impact Assessment and adopt the CAC Standard Contract.</li>
  <li><strong>From California (CCPA/CPRA):</strong> we disclose categories of personal information disclosed for a business purpose as set out in Section 12.</li>
</ul>
<p>You can request a copy of the safeguards in place for any specific transfer by writing to <a href="mailto:support@cdsspace.pro">support@cdsspace.pro</a>.</p>

<h2 id="retention">7. How Long We Keep Your Data</h2>
<ul>
  <li><strong>Account data:</strong> for as long as your account is active, plus up to 24 months after closure to handle disputes and legal obligations.</li>
  <li><strong>Project and creative files:</strong> for the duration of the engagement, plus a further 7 years for tax and contractual record-keeping in Nigeria.</li>
  <li><strong>Payment &amp; tax records:</strong> at least 6 years, as required by Nigerian tax law, and longer where required by your jurisdiction.</li>
  <li><strong>Marketing data:</strong> until you withdraw consent or unsubscribe, then removed from active lists.</li>
  <li><strong>Career applications:</strong> up to 12 months after a hiring decision, unless you ask us to delete them sooner.</li>
  <li><strong>Server &amp; security logs:</strong> up to 12 months, then aggregated or deleted.</li>
</ul>

<h2 id="rights">8. Your Rights</h2>
<p>Subject to the law applicable to you, you have the following rights over your personal data:</p>
<ul>
  <li><strong>Access</strong> - ask for a copy of the data we hold about you.</li>
  <li><strong>Rectification</strong> - ask us to correct inaccurate or incomplete data.</li>
  <li><strong>Erasure / Deletion</strong> - ask us to delete data we no longer need to hold.</li>
  <li><strong>Restriction</strong> - ask us to pause processing in certain circumstances.</li>
  <li><strong>Objection</strong> - object to processing based on our legitimate interests, including direct marketing.</li>
  <li><strong>Portability</strong> - receive your data in a structured, machine-readable format and transmit it elsewhere.</li>
  <li><strong>Withdraw consent</strong> - at any time, without affecting the lawfulness of processing before withdrawal.</li>
  <li><strong>Lodge a complaint</strong> - with the Nigeria Data Protection Commission (NDPC), your local supervisory authority in the EU/UK, the National Cyber Security Authority of Rwanda, the California Attorney General, or the Cyberspace Administration of China.</li>
  <li><strong>Non-discrimination (California)</strong> - we will not deny you service, charge you a different price, or provide a lower quality of service because you exercised a CCPA/CPRA right.</li>
  <li><strong>Opt-out of sale / sharing (California)</strong> - we do not sell your personal information, and we do not share it for cross-context behavioural advertising.</li>
  <li><strong>Right to know personal information processing (China, PIPL)</strong> - including the right to copy, correct, delete, and, in the event of death, for your next of kin to exercise your rights.</li>
</ul>
<p>To exercise any right, email <a href="mailto:support@cdsspace.pro">support@cdsspace.pro</a>. We will respond within 30 days (or the shorter period required by your jurisdiction), and may ask you to verify your identity before we act.</p>

<h2 id="security">9. How We Protect Your Data</h2>
<p>We maintain administrative, technical, and physical safeguards designed to protect your data, including:</p>
<ul>
  <li>Transport Layer Security (HTTPS/TLS) on all web traffic.</li>
  <li>Password hashing and OAuth 2.0 with nonce and state verification.</li>
  <li>Role-based access control for the staff admin portal.</li>
  <li>Principle of least privilege for databases and storage buckets.</li>
  <li>Regular patching and dependency updates.</li>
  <li>Logging and monitoring of authentication and authorisation events.</li>
  <li>Written agreements with all processors.</li>
</ul>
<p>In the event of a personal-data breach that is likely to result in a risk to your rights, we will notify the Nigeria Data Protection Commission and, where required, you, within 72 hours of becoming aware of it, in accordance with the NDPA and any other applicable law.</p>

<h2 id="cookies">10. Cookies &amp; Similar Technologies</h2>
<p>We use the following categories of cookies:</p>
<ul>
  <li><strong>Strictly necessary</strong> - session and authentication cookies (<code>sb-*</code>, <code>cds_oauth_state</code>, <code>cds_oauth_nonce</code>, <code>cds_oauth_next</code>) that are required for sign-in and security. These cannot be disabled.</li>
  <li><strong>Functional</strong> - to remember your preferences.</li>
  <li><strong>Analytics</strong> - to understand how the Services are used, in aggregate form.</li>
</ul>
<p>You can control non-essential cookies through your browser settings and, where shown, our in-product cookie banner. Withdrawing consent will not affect any service you are logged into.</p>

<h2 id="children">11. Children</h2>
<p>Our Services are intended for users aged 18 and over. We do not knowingly collect personal data from children under 13 (United States, COPPA), under 16 (EU/UK GDPR, where national law sets that age), or under 18 (Nigeria NDPA, for our commercial services). If you believe we have collected data from a child, please contact us and we will delete it.</p>

<h2 id="california">12. Additional Disclosures for California Residents</h2>
<p>In the 12 months before the effective date above, we have collected and disclosed the following categories of personal information under CCPA/CPRA: identifiers, customer records, commercial information, internet/network activity, geolocation (approximate, from IP), and professional/employment information (for applicants).</p>
<p>We have <strong>not</strong> sold or shared personal information for cross-context behavioural advertising. California residents may submit verifiable requests under the &ldquo;Your Rights&rdquo; section and may designate an authorised agent to act on their behalf.</p>

<h2 id="china">13. Additional Disclosures for Users in China</h2>
<p>Where PIPL applies, the following additional points apply to you:</p>
<ul>
  <li>We process personal information only with your separate consent where PIPL requires it (for example, for cross-border transfers and processing of sensitive personal information).</li>
  <li>You can request that we designate a local representative for PIPL matters by contacting us.</li>
  <li>You may request that we stop processing your personal information or that your personal information be transferred to another provider in line with PIPL requirements.</li>
</ul>

<h2 id="automated">14. Automated Decision-Making</h2>
<p>We do not use your data for automated decision-making that produces legal effects or similarly significant effects concerning you. Where that changes, we will update this Policy and, where required, request your explicit consent.</p>

<h2 id="changes">15. Changes to This Policy</h2>
<p>We may update this Policy from time to time. When we make material changes, we will notify you by email or through an in-product notice at least 14 days before the change takes effect, and we will update the effective date above. Your continued use of the Services after the effective date means you accept the updated Policy.</p>

<h2 id="contact">16. How to Contact Us</h2>
<p>For any question about this Policy or how we handle your data, contact:</p>
<p><strong>CDS Space - Data Protection</strong><br/>Email: <a href="mailto:support@cdsspace.pro">support@cdsspace.pro</a></p>
<p><em>Note: This document is provided as a good-faith compliance framework based on publicly available statutes as of the effective date. It is not legal advice. Before relying on it, have it reviewed by qualified counsel in each jurisdiction where you operate.</em></p>
`.trim();

const TERMS_CONTENT = `
<h2 id="acceptance">1. Acceptance of These Terms</h2>
<p>These Terms constitute a contract between you (&ldquo;<strong>you</strong>&rdquo;, &ldquo;<strong>Client</strong>&rdquo;, or &ldquo;<strong>User</strong>&rdquo;) and <strong>CDS Space</strong> (&ldquo;<strong>CDS Space</strong>&rdquo;, &ldquo;<strong>we</strong>&rdquo;, &ldquo;<strong>us</strong>&rdquo;, or &ldquo;<strong>our</strong>&rdquo;), a branding, design, and digital-production studio operating from the Federal Republic of Nigeria and serving clients globally. By creating an account, using the Services, or signing an engagement letter with us, you confirm that you have read, understood, and accepted these Terms and our <a href="/privacy">Privacy Policy</a>.</p>

<h2 id="eligibility">2. Eligibility</h2>
<ul>
  <li>You must be at least 18 years old, or the age of majority in your jurisdiction, whichever is higher.</li>
  <li>If you are entering into these Terms on behalf of an organisation, you represent that you are authorised to bind that organisation and that the organisation accepts these Terms.</li>
  <li>You must not be located in, or a national or resident of, any country or individual subject to Nigerian or applicable international trade sanctions that prohibit our engagement.</li>
</ul>

<h2 id="services">3. The Services</h2>
<p>CDS Space provides:</p>
<ul>
  <li>Brand strategy, identity design, and brand-word development.</li>
  <li>UI/UX design and web development.</li>
  <li>Industrial and commercial print production.</li>
  <li>Merchandise design and fulfilment.</li>
  <li>Access to client dashboards, invoicing, chat, and project-tracking tools.</li>
  <li>Careers and contractor-onboarding portals.</li>
</ul>
<p>We may add, modify, or discontinue features at any time. Where a change materially reduces a core feature you rely on, we will give you reasonable advance notice.</p>

<h2 id="account">4. Accounts, Credentials &amp; Security</h2>
<ul>
  <li>You are responsible for the accuracy of the information you provide at sign-up and for keeping it up to date.</li>
  <li>You are responsible for maintaining the confidentiality of your password or any third-party credentials (such as Google) used to sign in, and for all activity on your account.</li>
  <li>You must notify us without undue delay at support@cdsspace.pro if you suspect unauthorised access to your account.</li>
  <li>We reserve the right to suspend or terminate accounts that appear to be compromised, fraudulent, or used in breach of these Terms.</li>
</ul>

<h2 id="engagements">5. Project Engagements, Fees &amp; Payment</h2>
<ul>
  <li><strong>Scope &amp; deliverables:</strong> each engagement is governed by a separate proposal, statement of work, or order confirmation (&ldquo;<strong>SOW</strong>&rdquo;) that sets out deliverables, timelines, and fees. The SOW and these Terms together form the full agreement for that engagement.</li>
  <li><strong>Fees &amp; currency:</strong> fees are quoted in Nigerian Naira or, for international clients, in USD. All amounts are exclusive of VAT, withholding tax, and any other applicable taxes unless stated otherwise.</li>
  <li><strong>Payment terms:</strong> unless the SOW says otherwise, 50% of the fee is payable on commencement and the balance on delivery. Subscription and retainer fees are billed in advance.</li>
  <li><strong>Late payment:</strong> overdue amounts accrue interest at 1.5% per month (or the maximum rate permitted by law, if lower). We may suspend delivery and access to the dashboards while any invoice is overdue.</li>
  <li><strong>Taxes:</strong> you are responsible for any taxes, duties, or levies imposed by your jurisdiction on the fees you pay us, other than taxes on our net income.</li>
  <li><strong>Refunds:</strong> once work has commenced, fees are non-refundable except where required by mandatory consumer law.</li>
</ul>

<h2 id="ip">6. Intellectual Property</h2>
<ul>
  <li><strong>Client materials:</strong> you retain all rights in the content, logos, and assets you supply to us. You grant us a licence to use them solely to deliver the Services.</li>
  <li><strong>Final deliverables:</strong> once you have paid in full for an engagement, we assign to you the rights in the final deliverables created specifically for you, except for any third-party assets (fonts, stock photography, open-source code) which remain subject to their own licences.</li>
  <li><strong>Pre-existing and reusable materials:</strong> we retain all rights in our pre-existing tools, templates, methodologies, and any reusable components. We grant you a worldwide, non-exclusive licence to use them as part of the final deliverables.</li>
  <li><strong>Portfolio use:</strong> unless you ask us in writing not to, we may display completed projects on cdsspace.pro, in proposals, and in marketing materials. We will never disclose confidential business information.</li>
  <li><strong>Feedback:</strong> if you send us suggestions or feedback, you grant us a perpetual, royalty-free licence to use them without obligation to you.</li>
</ul>

<h2 id="acceptable-use">7. Acceptable Use</h2>
<p>When using the Services, you will not:</p>
<ul>
  <li>Breach any applicable law in Nigeria or the jurisdiction you access the Services from.</li>
  <li>Upload, submit, or request work that is defamatory, obscene, hateful, infringing, or sexually exploitative of minors.</li>
  <li>Use the Services to distribute malware, phishing pages, or content that facilitates fraud.</li>
  <li>Attempt to gain unauthorised access to any part of the Services, another user&rsquo;s account, or our infrastructure.</li>
  <li>Reverse-engineer, scrape, or resell access to the Services except as expressly permitted.</li>
  <li>Infringe the intellectual property rights or privacy of any third party.</li>
</ul>
<p>We may remove content, suspend features, or terminate accounts that we reasonably believe breach this Section.</p>

<h2 id="third-parties">8. Third-Party Services</h2>
<p>The Services rely on third-party providers including Google (for Sign-In), GlashDB (for authentication and data storage), Vercel (for hosting), and payment processors. Your use of those services is also subject to their respective terms and privacy policies. We are not responsible for outages, changes, or failures of third-party services, but we will use reasonable efforts to minimise disruption.</p>

<h2 id="confidentiality">9. Confidentiality</h2>
<p>Each party will protect the other&rsquo;s confidential information with at least the same care it uses for its own, and only use it to perform or receive the Services. This obligation survives termination for 5 years, or indefinitely for trade secrets. It does not apply to information that is public, was already known, is independently developed, or is required to be disclosed by law.</p>

<h2 id="data">10. Data Protection</h2>
<p>We handle your personal data in accordance with our <a href="/privacy">Privacy Policy</a>, which is incorporated into these Terms. Where you upload personal data of third parties (for example, employees or customers of your business) into our Services, you are the data controller of that data and we act as your processor. A data-processing addendum is available on request at <a href="mailto:support@cdsspace.pro">support@cdsspace.pro</a>.</p>

<h2 id="warranties">11. Warranties &amp; Disclaimers</h2>
<ul>
  <li>We warrant that the Services will be provided with reasonable skill and care in accordance with the SOW.</li>
  <li>Except as expressly stated, the Services are provided &ldquo;as is&rdquo; and &ldquo;as available&rdquo;. To the fullest extent permitted by law, we disclaim all other warranties, whether express, implied, statutory, or otherwise, including any warranty of merchantability, fitness for a particular purpose, or non-infringement.</li>
  <li>We do not warrant that the Services will be uninterrupted, error-free, or free of harmful components.</li>
  <li>Nothing in these Terms excludes liability that cannot be excluded under applicable law, including the Federal Competition and Consumer Protection Act 2018 in Nigeria, the Consumer Rights Act 2015 in the UK, or mandatory consumer laws in the EU, Rwanda, the USA, or China.</li>
</ul>

<h2 id="liability">12. Limitation of Liability</h2>
<ul>
  <li>To the fullest extent permitted by law, neither party will be liable for any indirect, incidental, special, consequential, or punitive damages, or for loss of profits, revenue, goodwill, or data, however caused.</li>
  <li>Our aggregate liability to you for any and all claims arising out of or relating to an engagement is limited to the total fees paid by you to us for that engagement in the 12 months preceding the claim.</li>
  <li>These limits apply whether the claim arises in contract, tort (including negligence), statute, or otherwise, and even if we have been advised of the possibility of the loss.</li>
  <li>Nothing in this Section limits liability for death or personal injury caused by negligence, for fraud, or for any other liability that cannot be limited under applicable law.</li>
</ul>

<h2 id="indemnity">13. Indemnification</h2>
<p>You agree to indemnify and hold CDS Space, its directors, employees, and contractors harmless from any claim, liability, loss, or expense (including reasonable legal fees) arising out of your breach of these Terms, your misuse of the Services, your content, or your violation of any law or third-party right. We will give you prompt notice of any such claim and reasonable cooperation in defending it.</p>

<h2 id="term">14. Suspension &amp; Termination</h2>
<ul>
  <li>You may terminate your account at any time by contacting us.</li>
  <li>Either party may terminate an engagement for material breach that has not been remedied within 14 days of written notice.</li>
  <li>We may suspend or terminate your access immediately where required by law, on reasonable suspicion of fraud or serious abuse, or where keeping the account active poses a risk to our Services or other users.</li>
  <li>On termination, your obligation to pay for work already performed survives. Sections that by their nature should survive (IP, confidentiality, liability, governing law) will survive termination.</li>
</ul>

<h2 id="force-majeure">15. Force Majeure</h2>
<p>Neither party is liable for failure to perform its obligations (other than payment obligations) caused by events beyond its reasonable control, including acts of God, war, terrorism, civil unrest, epidemics, cyber-attacks, government action, power failures, or internet outages.</p>

<h2 id="changes">16. Changes to These Terms</h2>
<p>We may amend these Terms from time to time. Material changes will be notified by email or by a prominent in-product notice at least 14 days before they take effect. Your continued use of the Services after that date means you accept the updated Terms. If you do not accept them, you must stop using the Services.</p>

<h2 id="governing-law">17. Governing Law &amp; Dispute Resolution</h2>
<ul>
  <li><strong>Governing law:</strong> these Terms are governed by the laws of the Federal Republic of Nigeria, without regard to conflict-of-law rules.</li>
  <li><strong>Jurisdiction:</strong> subject to the rights of consumers set out below, the courts of Lagos State, Nigeria have exclusive jurisdiction over any dispute arising out of these Terms. We may also seek injunctive relief in any court of competent jurisdiction.</li>
  <li><strong>Alternative resolution:</strong> before filing a claim, each party agrees to attempt in good faith to resolve the dispute through negotiation for at least 30 days. Commercial disputes exceeding NGN 5,000,000 (or USD equivalent) may, at either party&rsquo;s election, be submitted to arbitration in Lagos under the Arbitration and Mediation Act 2023, with a single arbitrator and proceedings conducted in English.</li>
  <li><strong>Consumers:</strong> if you are a consumer resident in the European Union, the United Kingdom, Rwanda, the United States, China, or any other jurisdiction whose mandatory laws give you protections that cannot be overridden by contract, nothing in these Terms limits those protections. You may bring proceedings in the courts of your place of residence where that law requires.</li>
</ul>

<h2 id="general">18. General</h2>
<ul>
  <li><strong>Entire agreement:</strong> these Terms, together with any SOW and the Privacy Policy, form the entire agreement between us on this subject and supersede any prior discussions.</li>
  <li><strong>Severability:</strong> if any provision is found unenforceable, the remainder will continue in full force.</li>
  <li><strong>No waiver:</strong> a failure to enforce a right is not a waiver of it.</li>
  <li><strong>Assignment:</strong> you may not assign these Terms without our prior written consent. We may assign them to an affiliate or in connection with a corporate transaction on equivalent terms.</li>
  <li><strong>Notices:</strong> notices to us should be sent to support@cdsspace.pro. Notices to you will be sent to the email address on your account.</li>
  <li><strong>Language:</strong> the authoritative version of these Terms is the English version.</li>
</ul>

<h2 id="contact">19. Contact</h2>
<p><strong>CDS Space</strong><br/>Email: <a href="mailto:support@cdsspace.pro">support@cdsspace.pro</a></p>
<p><em>Note: This document is a good-faith compliance framework based on publicly available statutes as of the effective date. It is not legal advice. Have it reviewed by qualified counsel in each jurisdiction where you operate before relying on it.</em></p>
`.trim();

export const DEFAULT_LEGAL_DOCS: Record<"privacy" | "terms", DefaultLegalDoc> = {
    privacy: {
        slug: "privacy",
        title: "Privacy Policy",
        subtitle:
            "How CDS Space collects, uses, shares, and protects personal data when you access cdsspace.pro, cdsspace.com, our dashboards, or engage our branding, design, development, and print services.",
        effective_date: "2026-04-20",
        content: PRIVACY_CONTENT,
    },
    terms: {
        slug: "terms",
        title: "Terms of Service",
        subtitle:
            "These Terms of Service form a legally binding agreement between you and CDS Space. By accessing our websites, dashboards, or engaging any of our branding, design, development, or print services, you agree to be bound by these Terms.",
        effective_date: "2026-04-20",
        content: TERMS_CONTENT,
    },
};

export type LegalSlug = keyof typeof DEFAULT_LEGAL_DOCS;

export function isLegalSlug(value: string): value is LegalSlug {
    return value === "privacy" || value === "terms";
}
