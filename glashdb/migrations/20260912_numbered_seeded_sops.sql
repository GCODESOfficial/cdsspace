begin;

create sequence if not exists public.team_compliance_sop_number_seq;

create or replace function public.next_team_compliance_sop_number()
returns text
language sql
as $$
  select 'CDS-SOP-' || lpad(nextval('public.team_compliance_sop_number_seq')::text, 6, '0');
$$;

alter table public.team_compliance_sops
  add column if not exists sop_number text;

alter table public.team_compliance_sops
  alter column sop_number set default public.next_team_compliance_sop_number();

update public.team_compliance_sops
set sop_number = public.next_team_compliance_sop_number()
where sop_number is null or btrim(sop_number) = '';

alter table public.team_compliance_sops
  alter column sop_number set not null;

create unique index if not exists team_compliance_sops_number_uq
  on public.team_compliance_sops (sop_number);

create index if not exists team_compliance_sops_department_number_idx
  on public.team_compliance_sops (lower(coalesce(department, '')), sop_number);

with seed (sop_number, title, summary, scope_type, department, task_name, content) as (
  values
  (
    'CDS-GEN-001',
    'Generalist: daily team operating standard',
    'The compulsory start-of-day, work-discipline, evidence, communication, security, reporting, and close-of-work procedure for every team member.',
    'general', null, null,
    $sop$Purpose
To give every CDS Space team member one consistent daily operating routine.

Procedure
1. Sign in with your own Team portal account. Never share a password, code, session, or protected link.
2. Open Attendance and check in before work. Start and end breaks accurately and keep your work status current.
3. Review notifications, Team Chat, Taskboard, assigned Projects, due dates, approvals, and blockers.
4. Confirm the day's priority outcomes and report any missing brief, asset, access, decision, or payment dependency before avoidable work begins.
5. Update the relevant Taskboard card or Project when work starts, changes state, becomes blocked, enters review, or is completed.
6. Keep decisions and instructions on the relevant platform record. Attach source files, exports, links, screenshots, documents, or other evidence.
7. Escalate a blocker, safety issue, client delay, scope change, security concern, or delivery risk within ten minutes of discovery.
8. Communicate professionally and share restricted information only with authorised recipients.
9. Read and acknowledge assigned SOPs. Use the Library, leave request, and Extra approvals workflows instead of relying on informal permission.
10. Before closing, record completed work, pending work, blockers, next actions, and file locations. Submit required reports, check out, and secure equipment and company information.

Evidence
Attendance record; current task/project status; work evidence; escalation record where needed; weekly report; accurate checkout.

Escalation
Immediately report safety, privacy, fraud, harassment, security, payment, legal, or missed-delivery risk to the authorised lead or administrator.$sop$
  ),
  (
    'CDS-TSK-001', 'Dashboard overview and daily review',
    'How every member reviews the Team dashboard and turns alerts, assignments, meetings, and deadlines into an accountable daily plan.',
    'task', null, 'Dashboard overview',
    $sop$1. Open the Team dashboard immediately after checking in.
2. Review personal status, assigned work, unread messages, approaching deadlines, pending approvals, and scheduled cMeet rooms.
3. Open each urgent record rather than acting from a summary card alone.
4. Confirm today's three priority outcomes and their owners, evidence, and deadlines.
5. Report stale, duplicated, missing, or incorrectly assigned records to the relevant administrator.
6. Recheck the dashboard after lunch and before checkout.
7. Do not mark an item complete until its evidence and next handoff are recorded.$sop$
  ),
  (
    'CDS-TSK-002', 'Attendance, breaks, leave, and availability',
    'The required procedure for location-aware check-in, break status, checkout, leave requests, and attendance exceptions.',
    'task', null, 'Attendance',
    $sop$1. Open Attendance and check in before beginning work.
2. Permit location access when on-site attendance requires it. Do not falsify a location or use another person's account.
3. Use an admin bypass code only when it was issued for the specific legitimate exception.
4. Start a break when leaving active work and end the break when returning.
5. Keep the displayed status accurate so other teams can plan handoffs.
6. Request leave with the correct type, dates, and reason. A submitted request is not an approval.
7. Review the recorded decision and remain available under the current schedule until approval is granted, except in a genuine emergency.
8. Check out before closing. Report an inaccurate or automatic checkout through the authorised channel.
9. Never edit, fabricate, or ask another person to create attendance evidence on your behalf.$sop$
  ),
  (
    'CDS-TSK-003', 'Taskboard work management',
    'How team members receive, execute, update, evidence, review, and complete work through Taskboard.',
    'task', null, 'Taskboard',
    $sop$1. Open the assigned card and read its list, priority, due date, description, members, comments, documents, and attachments.
2. Ask for clarification when the expected output or acceptance criteria are unclear.
3. Update the card when work starts and record the planned next action.
4. Use comments for progress, decisions, dependencies, and blockers.
5. Attach the working link, document, source file, preview, production evidence, or completion proof.
6. Move the card only to the state that matches the real work.
7. Submit completed work to the assigned reviewer. Do not bypass an internal review because your portion is finished.
8. Apply revisions, record what changed, and resubmit.
9. Close the task only when the required handoff has been accepted.$sop$
  ),
  (
    'CDS-TSK-004', 'Assigned project workspace',
    'The procedure for working with project timelines, milestones, tasks, documents, meetings, approvals, team members, and delivery dates.',
    'task', null, 'Projects',
    $sop$1. Verify that the project is assigned to you and review its production brief, timeline, internal deadline, client deadline, launch date, and team.
2. Review milestones, open tasks, documents, meetings, approvals, and Smart Analysis before starting.
3. Create or update only records within your assigned capability.
4. Keep client-sensitive information within authorised project areas.
5. Request approval when a scope, cost, deadline, public release, or final output requires it.
6. Record meeting decisions and attach supporting documents to the project.
7. Escalate overdue dependencies before they affect the client deadline.
8. Update progress and milestones with evidence.
9. Confirm the final package and handoff with Operations before treating the project as delivered.$sop$
  ),
  (
    'CDS-TSK-005', 'Preparing a delivery draft',
    'How an assigned team member packages finished work privately and submits it for internal admin review without seeing client identity details.',
    'task', null, 'Delivery drafts',
    $sop$1. Open the assigned delivery using its work code, production title, brief, and category.
2. Do not attempt to discover or request the hidden client's identity, contact details, or account information.
3. Add a clear internal delivery title and handover note.
4. Upload final files and documents in an organised folder structure, or add the approved Drive/Docs link.
5. Verify that files open, names are clear, versions are final, and no internal comments, secrets, or unrelated client files are included.
6. Let the server draft autosave and correct any save error before leaving.
7. Submit for internal review only when the package is complete.
8. Do not edit while the delivery is under review.
9. If revisions are requested, replace or correct the affected files, explain the change, and resubmit.
10. Only an authorised admin selects the client and releases the package.$sop$
  ),
  (
    'CDS-TSK-006', 'Weekly work reporting',
    'How each member submits an accurate weekly report with verifiable outcomes and approved supporting documents.',
    'task', null, 'Work Reports',
    $sop$1. Review the week's Taskboard, Project, Attendance, and delivery records.
2. Describe completed outcomes, not only activity or time spent.
3. Record pending work, blockers, decisions required, and the next planned action.
4. Attach only your authorised cDocs, Protect Docs, HTTPS document links, or approved PDFs.
5. Confirm that the report agrees with the underlying task and project records.
6. Submit the report by the required deadline.
7. If editing is permitted, correct facts transparently and retain the supporting evidence.
8. Never inflate output, hide delays, or attach confidential material outside its authorised audience.$sop$
  ),
  (
    'CDS-TSK-007', 'Team compliance, SOP acknowledgement, library, and extra approvals',
    'How members use assigned SOPs, office-library loans, invited authorship, and accountable overnight-office requests.',
    'task', null, 'Team compliance',
    $sop$1. Read every published generalist, dashboard-task, department, individual, or invited SOP visible to you.
2. Review attached images and videos. Acknowledge only after understanding the current version.
3. If invited to write an SOP, document the real procedure, add useful media, retain the assigned audience, and publish only when authorised.
4. Request a Library book through the platform for no more than 21 days.
5. Protect the book and return it by the due date. Record a donated book under the donor's correct name.
6. Start an Extra approval before any voluntary overnight office stay.
7. Enter the date, planned times, purpose, emergency contact, accepted terms, and signature.
8. Wait for the recorded decision and comply with every safety and security condition.
9. Report overdue books, damage, loss, or overnight security incidents immediately.$sop$
  ),
  (
    'CDS-TSK-008', 'Team Chat and accountable communication',
    'The procedure for direct, group, department, and project communication, attachments, message actions, and restricted information.',
    'task', null, 'Team Chat',
    $sop$1. Choose the correct direct, group, department, or project room before sending.
2. Keep finance, legal, people, management, and client-sensitive matters in authorised rooms.
3. State confirmed facts, decisions, questions, owners, and deadlines clearly.
4. Use replies, mentions, reactions, pins, bookmarks, and search to preserve context.
5. Upload only supported, clean, work-related images or PDF documents to intended recipients.
6. Verify a forwarded message will not expose restricted information to another team or client.
7. Correct an error promptly and do not delete records to conceal a mistake.
8. Move formal work instructions into Taskboard or Projects when they require ownership and tracking.
9. Escalate abusive, fraudulent, unsafe, or confidential-content incidents immediately.$sop$
  ),
  (
    'CDS-TSK-009', 'Creating, scheduling, hosting, and closing cMeet',
    'How members create instant or scheduled cMeet rooms, invite participants, manage admission, document decisions, and permit rejoining.',
    'task', null, 'cMeet',
    $sop$1. Select an instant meeting or a scheduled future meeting.
2. Enter a clear topic that identifies the purpose without exposing confidential information in the link or metadata.
3. For scheduled meetings, set the correct local date and time and invite the relevant team members.
4. Share the topic-aware link only through approved channels.
5. The creator acts as co-host when not an admin and may admit expected waiting participants.
6. Confirm participants, purpose, agenda, confidentiality, and decision owner at the start.
7. Protect private screens and documents. Admit only expected participants.
8. If a participant leaves, allow rejoining through the valid link while the room remains active.
9. Record decisions, actions, owners, and deadlines in the related task, project, consultation, or chat.
10. End or archive the room when its work and follow-up record are complete.$sop$
  ),
  (
    'CDS-TSK-010', 'Creating and sharing cDocs',
    'How members create, review, save, share, duplicate, archive, and prepare branded documents for signing.',
    'task', null, 'cDocs',
    $sop$1. Create a new document or duplicate the correct approved template.
2. Use a clear title and the correct document category.
3. Enter accurate names, dates, amounts, scope, links, and content.
4. Remove placeholders and confirm no confidential information is exposed to the wrong audience.
5. Save and review the document before sharing.
6. Use the approved share destination or copy the stable authorised link.
7. Send documents requiring execution through cSign rather than treating an editable draft as signed.
8. Archive obsolete material and preserve documents tied to signed or active records.$sop$
  ),
  (
    'CDS-TSK-011', 'Sending and managing cSign requests',
    'How members request internal or external signatures and preserve the completed signed record.',
    'task', null, 'cSign',
    $sop$1. Select the final reviewed cDoc.
2. Choose authorised internal signers or enter the correct external signer email.
3. Confirm signer order, ownership, document version, and purpose before sending.
4. Send the request and record its link only in the relevant authorised channel.
5. Monitor pending requests and follow up without coercion or misrepresentation.
6. Open the completed request and download the signed PDF.
7. Preserve the signed file and audit record in the relevant project or legal location.
8. Archive obsolete requests where permitted. Never delete a signed request as though it were a disposable draft.$sop$
  ),
  (
    'CDS-TSK-012', 'Creating and handling Protect Docs',
    'How members store and open sensitive text or files using the protected-document vault.',
    'task', null, 'Protect Docs',
    $sop$1. Use Protect Docs when ordinary chat or document sharing would expose sensitive material.
2. Create a clear non-sensitive title and add only the required protected content or file.
3. Apply a strong password where the workflow requires it.
4. Send the protected link and password through separate authorised channels when appropriate.
5. Confirm the recipient before granting access.
6. Do not copy protected content into broad chat rooms, screenshots, public links, or personal storage.
7. Remove obsolete records only when the retention requirement and owner permit it.
8. Report suspected access, disclosure, or password compromise immediately.$sop$
  ),
  (
    'CDS-TSK-013', 'Maintaining a professional cResume',
    'How members maintain an accurate public or private professional profile without exposing client or company-confidential work.',
    'task', null, 'cResume',
    $sop$1. Maintain accurate basics, headline, location, approved public contact information, biography, and links.
2. Keep skills, past roles, projects, and education current and truthful.
3. Mention only clients and work that CDS Space has authorised for public use.
4. Remove internal URLs, confidential details, unreleased work, private contacts, and protected files.
5. Review grammar, dates, titles, project role, and links.
6. Confirm the public/private setting before copying the public link.
7. Update the record after approved projects, certifications, responsibilities, or skills change.$sop$
  ),
  (
    'CDS-TSK-014', 'Team screening and certification tasks',
    'How assigned members complete screening, objective assessments, certifications, and related evidence honestly and securely.',
    'task', null, 'Screening and certifications',
    $sop$1. Open only the assessment or certification assigned to your account.
2. Read the instructions, permitted resources, deadline, and submission rules before starting.
3. Complete the work personally and do not share questions, answers, identity checks, or access links.
4. Maintain a stable environment and report a genuine technical interruption immediately.
5. Submit before the deadline and preserve the confirmation.
6. Upload only authentic certification evidence.
7. Report an incorrect assignment, result, or credential to the authorised HRM administrator.$sop$
  ),
  (
    'CDS-TSK-015', 'Team account settings and access security',
    'How members maintain profile, email, password, language, session, and portal-switching security.',
    'task', null, 'Settings and access',
    $sop$1. Keep your full name, valid email, department, role information, language, and permitted profile details accurate.
2. Complete email verification so task and security notices can reach you.
3. Use a unique strong password and protect verification codes and active sessions.
4. Never enter secrets into public forms, chat messages, cResume, task comments, screenshots, or source files.
5. Use the secure portal switch when an authorised staff member needs Team and Admin access.
6. Log out on a shared device and report a lost device, unexpected login, or suspected session misuse immediately.
7. Do not attempt to access another department, client, admin function, or record beyond your granted permissions.$sop$
  ),
  (
    'CDS-TSK-016', 'CREATE Studio and AI-assisted content production',
    'How team members create, refine, review, save, and hand off AI-assisted visual or written work from CREATE Studio.',
    'task', null, 'CREATE Studio',
    $sop$1. Open CREATE Studio from the Team portal and start from the approved task, project, content brief, or internal request.
2. Confirm the intended audience, format, dimensions, channel, brand, deadline, and acceptance criteria before generating content.
3. Use approved source material and prompts. Never enter credentials, private client data, unpublished financial information, or legally restricted material.
4. Treat generated output as a draft. Check facts, spelling, names, dates, links, rights, brand rules, visual quality, accessibility, and technical specifications.
5. Save useful iterations against the relevant task or project and identify the selected version clearly.
6. Obtain the required internal approval before publishing, sending, printing, presenting, or packaging generated work.
7. Move approved files into the controlled project or delivery workflow; do not use a temporary generation link as the final source file.
8. Record the prompt purpose, major edits, final file location, reviewer, and handoff status where the task requires an audit trail.$sop$
  ),
  (
    'CDS-DPT-001', 'Customer service department operating procedure',
    'The end-to-end standard for client communication, CRM records, consultations, order support, payment notices, delivery follow-up, and escalation.',
    'department', 'Customer Service', null,
    $sop$1. At shift start, review CRM Overview, Client/Brand List, Chat/Meet, Consultations, Client Orders, Deliveries, and unread communication.
2. Verify the client record and conversation history before replying.
3. Acknowledge WhatsApp enquiries within three minutes during working hours and other active channels within the published service target.
4. Record the enquiry, requested outcome, urgency, owner, next action, and follow-up date in CRM.
5. Link manual and platform client records only after confirming they belong to the same client.
6. Help clients use Brand Briefs, subscriptions, design requests, banners, merchandise, documents, orders, invoices, meetings, and deliveries.
7. Schedule cMeet with a clear topic and relevant participants when a consultation is needed.
8. Route commercial opportunities to Client Acquisition, payment questions to Finance, delivery risks to Operations, and quality issues to the producing department.
9. Never promise an unauthorised price, deadline, scope change, refund, legal position, or approval.
10. When a client reports payment, record it through the invoice-payment workflow. Finance confirms it independently.
11. After delivery, confirm access and record acceptance or revisions.
12. Close a case only when its response, action, next owner, and evidence are recorded.

Evidence: updated CRM record, conversation or meeting note, escalation record, follow-up status, and daily service summary.$sop$
  ),
  (
    'CDS-DPT-002', 'Media, content and marketing department operating procedure',
    'The standard for planning, creating, approving, publishing, distributing, and measuring CDS Space and authorised sub-brand communications.',
    'department', 'Media & Content', null,
    $sop$1. Review Content Hub Dashboard, Calendar, Library, Visual Library, Approval Queue, schedules, and failed publications.
2. Create a brief with objective, audience, channel, message, evidence, asset needs, owner, reviewer, publish time, and call to action.
3. Use properly licensed and approved media. Store reusable assets in Visual Library with useful metadata.
4. Draft platform-specific copy and creative direction. Verify every AI-assisted claim, name, date, link, competitor, and business fact.
5. Coordinate Creative, Photography, Video, R&D, Client Acquisition, and sub-brand owners.
6. Submit high-risk or review-required content through Approval Queue.
7. Schedule or publish only approved content and check the live rendering and link.
8. Respond to comments and messages or route qualified enquiries to Customer Service/Client Acquisition.
9. Record reach, engagement quality, saves, shares, enquiries, conversions, and lessons in Analytics.
10. Maintain Intelligence authors, taxonomy, comments, public publications, and restricted private reports.
11. Archive retired content without destroying its publication trail.

Evidence: approved brief, calendar entry, source/rights record, approval, live link, analytics report, and enquiry handoff.$sop$
  ),
  (
    'CDS-DPT-003', 'Finance and legal department operating procedure',
    'The standard for quotations, invoices, payments, expenditure, payroll, audit, contracts, public policies, and AML/CTF controls.',
    'department', 'Finance and Legal', null,
    $sop$1. Review Finance Overview, pending payment confirmations, invoices, quotations, expenditure, payroll, subscriptions, audit exceptions, and legal work.
2. Prepare quotations from approved scope and price lists; confirm items, currency, validity, tax, terms, and samples.
3. Fill, save, and review a complete invoice before sending. Never send an empty or zero-value draft as final.
4. When a client reports payment, verify bank inflow, reference, amount, currency, payer, invoice, and date before confirming paid and issuing a receipt.
5. Record expenditure with payee, purpose, category, amount, date, proof, and approval.
6. Prepare payroll from authorised employee, attendance, adjustment, and pay-cycle information. Separate preparation, review, and release where possible.
7. Reconcile inflows, outflows, receipts, liabilities, subscriptions, vendor payments, and payroll; investigate every discrepancy.
8. Maintain Privacy Policy, Terms, Brand Marketer Agreement, AML/CTF Policy, and approved future legal documents with version and effective date.
9. Use cDocs and cSign for controlled agreements and preserve signed PDFs and audit history.
10. Apply identification, beneficial-ownership, transaction review, risk escalation, record-retention, and legally required reporting controls.
11. Review high-risk public, client, partner, vendor, intellectual-property, data, and regulatory claims.

Evidence: complete financial record, payment verification, reconciliation, approval, signed agreement, legal version, and audit remediation.$sop$
  ),
  (
    'CDS-DPT-004', 'Operations and management department operating procedure',
    'The standard for converting client commitments into assigned, reviewed, delivered, and auditable work across departments.',
    'department', 'Management', null,
    $sop$1. Review new orders, active projects, Taskboards, delivery drafts, staffing, attendance, approvals, and operational risks.
2. Verify the brief and required commercial authorisation.
3. Create a client-safe production title and internal brief. Remove contact and unrelated confidential details from team-visible work.
4. Route contained work to Taskboard and multi-stage work to Projects.
5. Assign department, members, milestones, internal deadline, client deadline, dependencies, acceptance criteria, and reviewer.
6. Monitor progress and escalate capacity, scope, payment, material, approval, or delivery risk.
7. Require the producing team to submit finished work for internal review.
8. Approve, reject, or request revisions based on the brief and quality standard.
9. Package approved work in Client Deliveries with the correct client, project, cover, description, files, and stable public link.
10. Hold work securely when a client has no account until Customer Service completes the invite or merge.
11. Maintain departments, roles, permissions, leave decisions, attendance exceptions, reports, SOPs, library control, and overnight approvals.
12. Preserve separation of duties and the complete audit trail.

Evidence: assignment, timeline, status updates, approval, delivery record, operations summary, and risk log.$sop$
  ),
  (
    'CDS-DPT-005', 'Creative design department operating procedure',
    'The standard for brief interpretation, creative production, review, final files, delivery drafts, archives, and approved Works publication.',
    'department', 'Creative Design', null,
    $sop$1. Review the work code, production title, brief, dimensions, formats, references, brand guide, deadline, and reviewer.
2. Request missing content, assets, decisions, or production details before designing.
3. Create concepts that meet the objective, audience, brand, hierarchy, typography, colour, and accessibility requirements.
4. Share draft links or previews on the assigned Taskboard card or Project.
5. Submit work to the Creative Director or authorised reviewer before any client release.
6. Apply feedback accurately and retain recoverable versions.
7. Prepare final source and export files in the required colour mode, resolution, ratio, bleed, format, and naming structure.
8. Build an organised delivery package with exports, included source files, linked assets, fonts/licences, print/screen variants, and handover notes.
9. Upload the package to Delivery drafts, save it, and submit for internal review without seeking hidden client details.
10. Archive the approved source location on the task/project.
11. Publish to Upload Works only after authorisation and with accurate title, category, description, visuals, credits, and non-confidential information.

Evidence: concept, review, revision response, source folder, final exports, delivery draft, and approved Works link.$sop$
  ),
  (
    'CDS-DPT-006', 'Product design (UI/UX) department operating procedure',
    'The standard for research, flows, wireframes, responsive UI, prototypes, design systems, engineering handoff, and design QA.',
    'department', 'Product Design', null,
    $sop$1. Review the product problem, user, journey, platform, deadline, design context, acceptance criteria, and technical constraints.
2. Record research, evidence, assumptions, risks, and unresolved questions.
3. Create information architecture, flows, and wireframes before high-fidelity design when complexity requires it.
4. Design desktop and mobile layouts plus empty, loading, success, error, disabled, permission, keyboard, and touch states.
5. Maintain clean Figma pages, components, variants, variables, auto layout, and naming.
6. Use established product and brand patterns before introducing a new component.
7. Submit the design for product, technical, accessibility, and stakeholder review.
8. Apply approved feedback and produce developer-ready notes, assets, content rules, and interaction behaviour.
9. Support implementation through recorded decisions.
10. Review the built result on supported screens and log deviations as tasks.
11. Package approved design artefacts through Delivery drafts where included in client scope.

Evidence: research summary, flow, Figma link, responsive/state coverage, handoff notes, and design QA record.$sop$
  ),
  (
    'CDS-DPT-007', 'Print production department operating procedure',
    'The standard for preflight, materials, machinery, proofing, print quality, finishing, waste, packaging, and handover.',
    'department', 'Print Production', null,
    $sop$1. Review the approved order, artwork, size, ratio, quantity, material, colour, finishing, deadline, and handover instructions.
2. Confirm payment or production authorisation where required.
3. Preflight format, ratio, bleed, safe area, spelling, orientation, colour mode, image quality, and finishing marks.
4. Judge banner raster compatibility by ratio tolerance, not absolute pixel dimensions alone.
5. Stop and request correction when artwork or specification is unsafe, unclear, or unsuitable.
6. Inspect machines, tools, inks, media, finishing equipment, and safety conditions.
7. Confirm stock with Procurement and reserve it against the work code.
8. Produce and approve a proof or first article when required.
9. Monitor colour, alignment, trimming, lamination, finishing, quantity, faults, and waste during production.
10. Record material use, waste, errors, reprints, maintenance, and completed quantity.
11. Package and label the job using the work code and approved handoff details.
12. Update the task/project, hand over to Operations, and clean and secure the production area.

Evidence: approved artwork, preflight, proof, QC record, material/waste log, package, and handover.$sop$
  ),
  (
    'CDS-DPT-008', 'Web and app development department operating procedure',
    'The standard for requirements, code, data, security, testing, migrations, Glash deployment, monitoring, and technical handoff.',
    'department', 'Development', null,
    $sop$1. Review the approved requirement, design, acceptance criteria, permissions, dependencies, deadline, and authorised environment.
2. Clarify missing states, data rules, integrations, security boundaries, and failure behaviour before coding.
3. Work in the approved repository and preserve unrelated changes in shared workspaces.
4. Never expose credentials in code, logs, screenshots, chat, public variables, or committed files.
5. Implement small reviewable changes with server-side authentication and least-privilege authorisation.
6. For database work, resolve the approved connection, confirm the non-secret target and scope, apply the migration, and verify state.
7. Run relevant unit, contract, security, policy, type, build, responsive, accessibility, and browser checks.
8. Review the change and validate admin, team, client, marketer, and public permissions where affected.
9. Deploy through Glash and inspect build, container, runtime-probe, and application logs.
10. Smoke-test the live route, mobile behaviour, integrations, and recovery path.
11. Update technical documentation, environment requirements, known limitations, and task/project evidence.

Evidence: reviewed change, tests, migration verification, deployment, smoke test, and technical documentation.$sop$
  ),
  (
    'CDS-DPT-009', 'Sub-brand management operating procedure',
    'The standard for managers of CSCN, BOS, and future sub-brands to coordinate strategy, work, content, pipeline, finance, and reporting.',
    'department', 'Sub-brand Management', null,
    $sop$1. Maintain the approved sub-brand purpose, audience, offer, identity, goals, initiatives, and key documents.
2. Create a clear Project or Taskboard structure and identify the sub-brand in titles and categories.
3. Brief shared Creative, Content, Product, Development, Client Acquisition, Operations, and R&D teams through their normal workflows.
4. Route leads and partners into CRM or Deals with the correct source and sub-brand context.
5. Request quotations, invoices, expenditure, purchases, contracts, and legal reviews from the central authorised departments.
6. Review work for sub-brand fit without bypassing central quality, legal, finance, or security approval.
7. Track pipeline, revenue, spend, audience, delivery commitments, risks, and performance.
8. Preserve decisions, files, approvals, and external commitments on the relevant platform record.
9. Submit a weekly report covering results, pipeline, delivered work, spend, risks, decisions, and next priorities.

Evidence: strategy record, initiative board, approved brief, CRM/Deals entries, finance/legal references, outputs, and weekly report.$sop$
  ),
  (
    'CDS-DPT-010', 'Procurement department operating procedure',
    'The standard for purchase requests, vendor sourcing, comparison, approval, ordering, receipt, inspection, and reconciliation.',
    'department', 'Procurement', null,
    $sop$1. Receive a documented need with specification, quantity, required date, budget owner, and delivery location.
2. Check available approved stock, licences, contracts, and existing vendors before sourcing.
3. Review or create the supplier in Vendors with type, contact details, agreement status, notes, and owner.
4. Obtain and compare quotations where practical, including quality, lead time, warranty, delivery, tax, and total cost.
5. Record a justified single-source decision when competition is impractical.
6. Request Legal review for high-risk terms and Finance/Management approval before commitment or payment.
7. Place the approved order and record supplier, quantity, price, currency, terms, reference, and due date.
8. Inspect delivered goods or services with the requesting department for quantity, specification, condition, and quality.
9. Send verified invoice and receipt evidence to Finance.
10. Record defects, rejection, credit, warranty, delay, and vendor performance.
11. Maintain the controlled stock/reorder record until a dedicated procurement inventory module is available.

Evidence: request, comparison, approval, agreement, order, inspection, receipt, finance handoff, and vendor review.$sop$
  ),
  (
    'CDS-DPT-011', 'Client acquisition department operating procedure',
    'The standard for lawful prospect research, qualification, audits, proposals, outreach, pipeline movement, meetings, and conversion handoff.',
    'department', 'Client Acquisition', null,
    $sop$1. Define the target segment, geography, business problem, service fit, campaign objective, and exclusions.
2. Add organisations through Prospect Generation using legitimate supplied or public sources.
3. Review generated analysis manually. Remove duplicate pages and the analysed company itself from competitor lists.
4. Classify real direct competitors, indirect competitors, substitutes, partners, and irrelevant results correctly.
5. Verify business status, website, location, decision-maker route, evidence, timing, and service relevance.
6. Add qualified organisations to Prospect Checklist with complete contact, research, status, next action, and follow-up data.
7. Use Details and Pipeline to maintain one evidence-based company history.
8. Create a relevant audit or proposal that reflects the real project opportunity, not a generic website overhaul.
9. Personalise lawful outreach, record the send and response, and avoid spam, deception, or unauthorised personal data.
10. Let Pipeline stages follow real events from shortlist through delivery.
11. Schedule consultation/cMeet when interest is confirmed.
12. Hand converted clients to Customer Service, Finance, and Operations with the complete scope, stakeholders, commitments, files, and next action.

Evidence: sources, reviewed research, competitor classes, checklist, outreach, audit/proposal, meeting, and conversion handoff.$sop$
  ),
  (
    'CDS-DPT-012', 'Research and development department operating procedure',
    'The standard for evidence-led research, experiments, company analysis, Intelligence, product recommendations, and post-implementation learning.',
    'department', 'Research and Development', null,
    $sop$1. Create a research task or Project with a clear question, decision, owner, deadline, audience, and permitted sources.
2. Review existing Intelligence, private reports, audits, client feedback, operational data, project lessons, and approved knowledge.
3. Gather reliable current evidence and record source, date, jurisdiction, limitation, and confidence.
4. Use approved AI tools for synthesis where useful, but verify every claim, competitor, logo variant, date, business status, and recommendation.
5. Distinguish direct competitors, indirect competitors, substitutes, partners, and same-brand pages.
6. For an experiment, define the hypothesis, baseline, method, success measure, risk, sample, and stop condition before testing.
7. Record results, failures, limitations, implications, and recommended action.
8. Obtain technical, legal, finance, brand, or management review appropriate to the subject.
9. Publish suitable work through Intelligence and keep client-confidential or commercially sensitive work private.
10. Convert an approved recommendation into a Taskboard task, Project, SOP revision, service change, pricing review, or product requirement.
11. Recheck the implemented change and record whether the expected result occurred.

Evidence: research brief, sources, analysis, experiment record, review, publication/requirement, and post-implementation result.$sop$
  )
)
insert into public.team_compliance_sops
  (sop_number, title, summary, content, scope_type, department, task_name, status,
   created_by, updated_by, version, published_at)
select sop_number, title, summary, content, scope_type, department, task_name,
       'published', 'CDS Space system', 'CDS Space system', 1, now()
from seed
on conflict (sop_number) do nothing;

insert into public.team_compliance_sop_assignments
  (sop_id, audience_type, assigned_by)
select s.id, 'all', 'CDS Space system'
from public.team_compliance_sops s
where s.sop_number = 'CDS-GEN-001' or s.sop_number like 'CDS-TSK-%'
on conflict do nothing;

with department_audiences (sop_number, department) as (
  values
    ('CDS-DPT-001', 'Customer Service'),
    ('CDS-DPT-001', 'Customer Relations'),
    ('CDS-DPT-002', 'Media & Content'),
    ('CDS-DPT-002', 'Media, Content and Marketing'),
    ('CDS-DPT-002', 'Marketing'),
    ('CDS-DPT-003', 'Finance and Legal'),
    ('CDS-DPT-003', 'Finance'),
    ('CDS-DPT-003', 'Legal'),
    ('CDS-DPT-004', 'Management'),
    ('CDS-DPT-004', 'Operations and Management'),
    ('CDS-DPT-004', 'Executive Class'),
    ('CDS-DPT-005', 'Creative Design'),
    ('CDS-DPT-006', 'Product Design'),
    ('CDS-DPT-006', 'UI/UX'),
    ('CDS-DPT-007', 'Print Production'),
    ('CDS-DPT-007', 'Production'),
    ('CDS-DPT-008', 'Development'),
    ('CDS-DPT-008', 'Web/App Development'),
    ('CDS-DPT-009', 'Sub-brand Management'),
    ('CDS-DPT-009', 'CSCN'),
    ('CDS-DPT-009', 'BOS'),
    ('CDS-DPT-010', 'Procurement'),
    ('CDS-DPT-011', 'Client Acquisition'),
    ('CDS-DPT-011', 'Sales'),
    ('CDS-DPT-012', 'Research and Development'),
    ('CDS-DPT-012', 'R&D')
)
insert into public.team_compliance_sop_assignments
  (sop_id, audience_type, department, assigned_by)
select s.id, 'department', audience.department, 'CDS Space system'
from department_audiences audience
join public.team_compliance_sops s on s.sop_number = audience.sop_number
on conflict do nothing;

with latest_generated_number as (
  select coalesce(max(substring(sop_number from '^CDS-SOP-([0-9]+)$')::bigint), 0) as value
  from public.team_compliance_sops
  where sop_number ~ '^CDS-SOP-[0-9]+$'
)
select setval(
  'public.team_compliance_sop_number_seq',
  greatest(value, 1),
  value > 0
)
from latest_generated_number;

commit;
