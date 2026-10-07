"use client";

import { FormEvent, PointerEvent as ReactPointerEvent, useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import {
  Bot,
  Grip,
  Mic,
  MicOff,
  Move,
  Send,
  ShieldCheck,
  X,
} from "lucide-react";

type Portal = "client" | "create" | "marketer" | "team" | "admin";

type PageGuide = {
  title: string;
  summary: string;
  steps: string[];
  sections?: Array<{ label: string; purpose: string }>;
  actions?: GuideAction[];
  /** Questions worth asking on this screen, in the words someone would use. */
  questions?: string[];
  /** Things that are easy to get wrong here, answered before they are asked. */
  tips?: string[];
};

type GuideContext = PageGuide & {
  portal: Portal;
  portalLabel: string;
  sections: Array<{ label: string; purpose: string }>;
  actions: GuideAction[];
  questions: string[];
  tips: string[];
  /** True when this screen has a written guide rather than the generic one. */
  detailed: boolean;
};

type GuideAction = {
  label: string;
  purpose: string;
  steps: string[];
};

type GuideMessage = {
  id: number;
  role: "guide" | "user";
  text: string;
};

type SpeechResultEvent = {
  results: ArrayLike<{ 0: { transcript: string } }>;
};

type SpeechRecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: SpeechResultEvent) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

const POSITION_KEY = "cds.dashboard-guide.position.v1";
const FAB_SIZE = 52;
const EDGE = 14;

const PORTAL_NAMES: Record<Portal, string> = {
  client: "Client dashboard",
  create: "Create Studio",
  marketer: "Marketer dashboard",
  team: "Team dashboard",
  admin: "Admin dashboard",
};

const GENERIC_GUIDES: Record<string, PageGuide> = {
  dashboard: {
    title: "Dashboard overview",
    summary: "Review your latest activity, key totals and the actions that need attention.",
    steps: ["Review the summary cards", "Open an item that needs attention", "Use the main action to start new work"],
  },
  create: {
    title: "Create Studio",
    summary: "Choose a creative tool, reopen saved work or begin a new document in your private workspace.",
    steps: ["Choose a pinned or quick-start tool", "Search by tool name or format", "Open My creations to continue saved work"],
  },
  "equipment-inventory": {
    title: "Equipment inventory",
    summary: "Record equipment, assignments, receipts and equipment types from one secure register.",
    steps: ["Add or review an equipment type", "Create an equipment record", "Assign it to the responsible team member"],
  },
  "sales-scripts": {
    title: "Sales scripts",
    summary: "Find and manage approved CDS Space wording for sales, marketing and consistent client conversations.",
    steps: ["Choose the right category and conversation stage", "Review and personalise the approved wording", "Copy it or publish an authorised update"],
  },
  subscription: {
    title: "Subscription plans",
    summary: "Compare available plans, included capacity and billing options before choosing a plan.",
    steps: ["Compare plan limits and turnaround", "Confirm your billing currency", "Choose the plan that fits your workload"],
  },
  messages: {
    title: "Messages",
    summary: "Read conversations, reply to a contact and keep project communication together.",
    steps: ["Select a conversation", "Review the recent messages", "Write and send your response"],
    sections: [
      { label: "Conversation list", purpose: "Find and switch between direct and project conversations." },
      { label: "Message composer", purpose: "Write replies, attach files, paste photos and send stickers." },
    ],
    actions: [
      { label: "Audio call", purpose: "Start an audio cMeet with the selected contact or group.", steps: ["Select the conversation", "Choose Audio call", "Confirm the meeting details and start the call"] },
      { label: "Video call", purpose: "Start a video cMeet with the selected contact or group.", steps: ["Select the conversation", "Choose Video call", "Confirm the meeting details and start the call"] },
      { label: "Send message", purpose: "Send the current text or staged attachment to the selected conversation.", steps: ["Choose the correct conversation", "Write the message and review any attachment", "Choose Send message"] },
      { label: "Stickers", purpose: "Open the shared sticker library or create a sticker from an emoji, image or short video.", steps: ["Choose Stickers", "Select or create a sticker", "Choose the sticker to send it"] },
    ],
  },
  chat: {
    title: "Chat",
    summary: "Keep team or client conversations organised in the correct thread.",
    steps: ["Choose a conversation", "Review its participants", "Type a reply or share an approved file"],
  },
  settings: {
    title: "Account settings",
    summary: "Manage profile, workspace and account preferences available to your role.",
    steps: ["Choose the settings section", "Update only the fields you need", "Save and check for confirmation"],
  },
  profile: {
    title: "Profile",
    summary: "Review your public and account information and keep your contact details current.",
    steps: ["Review your details", "Make the required changes", "Save and check for confirmation"],
  },
  work: {
    title: "Projects and work",
    summary: "Review assigned work, progress and the next action for each project.",
    steps: ["Filter or search the work list", "Open the relevant project", "Update progress or complete the required action"],
  },
  taskboard: {
    title: "Taskboard",
    summary: "Plan work by stage, owner and priority while keeping task progress visible.",
    steps: ["Find the relevant task or column", "Open the task details", "Update its owner, status or due date"],
  },
  timebook: {
    title: "Attendance",
    summary: "Record and review attendance activity for the current work period.",
    steps: ["Check your current status", "Use the available clock action", "Review the recorded time"],
    sections: [
      { label: "Attendance summary", purpose: "Shows attendance totals and flagged records for the selected period." },
      { label: "Geofence bypass codes", purpose: "Lets the super admin issue temporary location exceptions and review prior codes." },
      { label: "Attendance records", purpose: "Shows each member's schedule, check-in status and recorded work time." },
    ],
    actions: [
      { label: "Generate code", purpose: "Creates a temporary geofence bypass code. This action is available only to the super admin.", steps: ["Choose a member or leave Any team member selected", "Enter the approval reason and expiry", "Choose Generate code and share it securely"] },
      { label: "Monthly report", purpose: "Opens the monthly attendance report for review or export.", steps: ["Choose Monthly report", "Select the month and member scope", "Review or export the report"] },
      { label: "Export CSV", purpose: "Downloads the currently selected attendance range as a CSV file.", steps: ["Set the required date range", "Review the visible attendance records", "Choose Export CSV"] },
      { label: "Save schedule", purpose: "Saves the selected member's work-mode and attendance settings.", steps: ["Open the member row", "Update the schedule settings", "Choose Save and wait for confirmation"] },
    ],
  },
  cmeet: {
    title: "cMeet",
    summary: "Create, join and manage secure meeting rooms from this screen.",
    steps: ["Choose an existing meeting or create one", "Check your camera and microphone", "Open the meeting in its dedicated tab"],
    sections: [
      { label: "Create cMeet", purpose: "Starts a new audio or video meeting immediately or schedules it for later." },
      { label: "Join a meeting", purpose: "Opens a cMeet from a room code or meeting link." },
      { label: "Your meetings", purpose: "Lists meetings created from cMeet or Chat with join and sharing controls." },
    ],
    actions: [
      { label: "Audio cMeet", purpose: "Creates a voice-first meeting without requiring admin approval.", steps: ["Choose Audio cMeet", "Enter the title, timing and optional agenda", "Create the room and share or join it"] },
      { label: "Video cMeet", purpose: "Creates a meeting with video enabled without requiring admin approval.", steps: ["Choose Video cMeet", "Enter the title, timing and optional agenda", "Create the room and share or join it"] },
      { label: "Join cMeet", purpose: "Opens the room identified by the entered link or code.", steps: ["Paste the cMeet link or room code", "Check that the destination is recognised", "Choose Join cMeet"] },
      { label: "Share", purpose: "Shares a stable meeting link using the available external or in-app destination.", steps: ["Find the correct meeting", "Choose Share", "Select the destination and confirm"] },
    ],
  },
  cdocs: {
    title: "cDocs",
    summary: "Create, edit and organise collaborative documents in your workspace.",
    steps: ["Open a saved document or create one", "Edit the document content", "Confirm it is saved before leaving"],
  },
  "protect-docs": {
    title: "Protected documents",
    summary: "Manage protected files and their permitted access without sharing private storage links.",
    steps: ["Choose or upload a document", "Review its access settings", "Share only through an approved secure action"],
  },
  finance: {
    title: "Finance overview",
    summary: "Review financial activity and open the correct record type for more detail.",
    steps: ["Review the current totals", "Choose a finance section", "Open or create the required record"],
  },
  clients: {
    title: "Clients",
    summary: "Find client accounts and open the correct workspace or client record.",
    steps: ["Search or filter the client list", "Open the correct client", "Review details before making changes"],
  },
  invoices: {
    title: "Invoices",
    summary: "Create, review and track invoices and their payment status.",
    steps: ["Search or filter invoices", "Open an invoice for details", "Create or update it using the available action"],
  },
  quotations: {
    title: "Quotations",
    summary: "Prepare and manage quotations before converting approved work into a project or invoice.",
    steps: ["Find or create a quotation", "Review line items and totals", "Save or send it through the approved action"],
  },
  applications: {
    title: "Applications",
    summary: "Review submitted applications and move each candidate through the correct stage.",
    steps: ["Filter applications by status", "Open a candidate record", "Record the next decision or action"],
  },
  reports: {
    title: "Reports",
    summary: "Review performance information for the selected period and scope.",
    steps: ["Choose the date range or filter", "Review the key figures", "Export only when a downloadable report is needed"],
  },
  notifications: {
    title: "Notifications",
    summary: "Review account alerts and open the item connected to each notification.",
    steps: ["Review unread notifications", "Open the related record", "Mark handled items as read"],
  },
};

/**
 * The team portal, screen by screen.
 *
 * Written from what each page actually does, so the guide can name the real
 * sections and buttons rather than describing a dashboard in the abstract.
 */
const TEAM_GUIDES: Record<string, PageGuide> = {
  "team:dashboard": {
    title: "Team overview",
    summary: "Your day in one place: work assigned to you, unread messages, and the meetings coming up.",
    steps: ["Check Today at a glance for what needs you", "Open a project from Your recent work", "Check in for attendance if you have not yet"],
    sections: [
      { label: "Today at a glance", purpose: "Counts of assigned work, unread messages and upcoming meetings." },
      { label: "Your recent work", purpose: "Projects you are assigned to, with cover image and category." },
      { label: "Upcoming meetings", purpose: "Your next cMeet rooms with their time and room code." },
    ],
    actions: [
      { label: "Assign task", purpose: "Takes you to the taskboard to create or assign a task.", steps: ["Choose Assign task", "Pick the board and list", "Add the task and assignee"] },
      { label: "Check in", purpose: "Opens attendance so you can start today's session. The label follows your current state.", steps: ["Choose Check in", "Allow the location check if prompted", "Confirm the session has started"] },
      { label: "Open", purpose: "Opens that project in the Work area.", steps: ["Find the project card", "Choose Open", "Work from its tabs"] },
      { label: "View all", purpose: "Shows every project you are assigned to.", steps: ["Choose View all", "Filter by status or deadline", "Open the project you need"] },
    ],
    questions: [
      "Why does my assigned work count differ from my taskboard?",
      "Where do I check in for today's attendance?",
      "Which meeting is next and what is its room code?",
      "How do I open a project I am assigned to?",
    ],
    tips: ["The check-in button changes label to match your state: checked out, working, or on break."],
  },
  "team:taskboard": {
    title: "Taskboard",
    summary: "The shared board of lists and task cards. You work the board; admins create it.",
    steps: ["Pick the board from Your boards", "Open a task card to see what is required", "Drag the card to the next list as work progresses"],
    sections: [
      { label: "Your boards", purpose: "Switches between boards, and archives one if you can manage it." },
      { label: "Lists", purpose: "The columns of the board. Drag task cards between them." },
      { label: "Task card", purpose: "Description, assignees, due date, priority, notes, attachments, comments and activity." },
      { label: "Jump to a list", purpose: "On a phone, chips that jump to a list with its open-task count." },
    ],
    actions: [
      { label: "Add list", purpose: "Creates a new list on this board by name.", steps: ["Choose Add list", "Name the list", "It appears for everyone on the board"] },
      { label: "Add", purpose: "Quick-adds a task to the end of a list.", steps: ["Type the task name in the list", "Press Add", "Open it to add detail and assignees"] },
      { label: "Mark task complete", purpose: "Marks the open task done.", steps: ["Open the task", "Check the work is finished", "Choose Mark task complete"] },
      { label: "Upload internal file", purpose: "Attaches a file, a cDoc or an external link to the task.", steps: ["Open the task", "Choose the attachment type", "Confirm the attachment appears"] },
      { label: "Members", purpose: "Shows who is on this board.", steps: ["Choose Members", "Review the list", "Ask an admin to add anyone missing"] },
      { label: "Activity", purpose: "Shows the board's history of changes.", steps: ["Choose Activity", "Read the recent entries", "Open the task mentioned"] },
    ],
    questions: [
      "Why can I not create a new board here?",
      "How do I move a task to another list?",
      "Can I attach a cDoc to my task?",
      "Who else can see a list I create?",
    ],
    tips: ["Boards are created by an admin. If you see \"No taskboard yet\", ask an admin to set one up."],
  },
  "team:timebook": {
    title: "Attendance",
    summary: "Clock in and out, take breaks, see your attendance history and request leave.",
    steps: ["Check in when you start", "Use Start break and End break through the day", "Check out when you finish"],
    sections: [
      { label: "Attendance hero", purpose: "Your current state with in and out times, hours worked, overtime and sessions used." },
      { label: "My status", purpose: "Available, Busy, In meeting or On break, shown to the team while you are clocked in." },
      { label: "Recent attendance", purpose: "This month's table of date, in, out, hours worked and status." },
      { label: "Request leave", purpose: "Leave type, dates and reason, with your past requests and any HR questions." },
    ],
    actions: [
      { label: "Check in", purpose: "Starts a session. Your location is checked against the office.", steps: ["Choose Check in", "Allow the location check", "Confirm the session shows as working"] },
      { label: "Clock in with code", purpose: "Clocks you in away from the office using an admin bypass code.", steps: ["Ask an admin for the code", "Enter it in the geofence banner", "Confirm the session starts"] },
      { label: "Start break", purpose: "Pauses the session, and End break resumes it.", steps: ["Choose Start break", "Take the break", "Choose End break to resume"] },
      { label: "Check out", purpose: "Ends the current session.", steps: ["Finish what you are doing", "Choose Check out", "Check the hours recorded"] },
      { label: "Request leave", purpose: "Submits a leave request for approval.", steps: ["Choose the leave type and dates", "Give the reason", "Submit and watch for an HR reply"] },
    ],
    questions: [
      "Why am I blocked from checking in outside the office?",
      "How many check-in sessions do I get per day?",
      "Why was I automatically checked out?",
      "How do I reply to HR about my leave request?",
    ],
    tips: ["Sessions are limited per day, shown as Sessions x/3.", "An unfinished session is closed automatically at the daily cutoff."],
  },
  "team:work": {
    title: "Projects",
    summary: "The project workspace: tasks, milestones, files and approvals for the work you are assigned.",
    steps: ["Use the Projects or My Work lens to find your work", "Open the project and its tabs", "Request an approval when a stage is finished"],
    sections: [
      { label: "Metrics row", purpose: "Totals for active, completed, delayed, upcoming, approvals and overdue work." },
      { label: "My Work lens", purpose: "Narrows everything to the tasks assigned to you." },
      { label: "Project tabs", purpose: "Overview, Tasks, Milestones, Timeline, Files, Approvals and Calendar." },
      { label: "Side panels", purpose: "Team, progress, milestones, coverage and recent activity for the open project." },
    ],
    actions: [
      { label: "New task", purpose: "Adds a task to the project. The quick-add field adds one on Enter.", steps: ["Choose New task", "Set the title, owner and due date", "Save and check it appears"] },
      { label: "Request an approval", purpose: "Asks for review, linked to a milestone, task or brief.", steps: ["Open the finished work", "Choose Request an approval", "Pick what it relates to and submit"] },
      { label: "Approve", purpose: "Records your decision on a pending approval, or asks for a revision.", steps: ["Open the approval", "Review the work", "Choose Approve or Revision"] },
      { label: "Add a file", purpose: "Attaches a document or shared link to the project.", steps: ["Open the Files tab", "Choose Add a file", "Give the name or link"] },
    ],
    questions: [
      "Why is this project marked delayed?",
      "Which tasks are assigned to me across projects?",
      "How do I request final sign-off on a milestone?",
      "How do I link the brand brief to this project?",
    ],
  },
  "team:deliveries": {
    title: "Delivery drafts",
    summary: "Prepare finished work as a private draft, then submit it for internal review before a client ever sees it.",
    steps: ["Open or create the draft for the work code", "Upload the files or paste the Drive link", "Submit for internal review"],
    sections: [
      { label: "Draft list", purpose: "Your drafts by work code, with status and file count." },
      { label: "Prepare internal delivery", purpose: "Delivery title, internal handover notes, and a Drive or Docs link." },
      { label: "Files and documents", purpose: "The uploaded files with their size, each removable until you submit." },
      { label: "Status banners", purpose: "Tells you when a draft is submitted, or when changes were requested." },
    ],
    actions: [
      { label: "Upload files", purpose: "Adds files to the draft.", steps: ["Choose Upload files", "Select the finished work", "Check each file is listed"] },
      { label: "Submit for internal review", purpose: "Locks the draft and sends it to an admin.", steps: ["Check the title, notes and files", "Choose Submit for internal review", "Wait for approval or a revision note"] },
      { label: "Remove", purpose: "Deletes a file from the draft after confirming.", steps: ["Find the file", "Choose the bin icon", "Confirm the removal"] },
    ],
    questions: [
      "Why can I no longer edit this delivery?",
      "Can I submit only a Drive link with no files?",
      "What did the admin want changed on this revision?",
      "Who is the client for this work code?",
    ],
    tips: ["Client identity and contact details are deliberately not shown here.", "The title and notes save themselves as you type."],
  },
  "team:work-tracking": {
    title: "Weekly report",
    summary: "One report a week: what you completed, your wins, your blockers, and next week's goals.",
    steps: ["Fill in what you completed this week", "Attach anything that evidences it", "Submit before the week closes"],
    sections: [
      { label: "Report fields", purpose: "Completed work (required), wins, challenges or blockers, and next week's goals." },
      { label: "Supporting documents", purpose: "Attach a cDoc, a protected doc, an external link, or a PDF up to 5MB." },
      { label: "Locked summary", purpose: "Once submitted, the week is shown read-only." },
    ],
    actions: [
      { label: "Submit report", purpose: "Submits the week's report and locks it.", steps: ["Complete the required field", "Attach any evidence", "Choose Submit report"] },
      { label: "Edit report", purpose: "Reopens the submitted report for the same week.", steps: ["Choose Edit report", "Make the change", "Choose Save changes"] },
      { label: "Attach", purpose: "Adds a cDoc, protected doc or HTTPS link to the report.", steps: ["Choose Attach", "Pick the document or paste the link", "Check it is listed"] },
      { label: "Upload PDF", purpose: "Uploads a PDF attachment, up to 5MB.", steps: ["Choose Upload PDF", "Select the file", "Wait for it to appear"] },
    ],
    questions: [
      "Can I still change my report after submitting it?",
      "Why was my PDF upload rejected?",
      "Which week does this report cover?",
      "What counts as a blocker worth reporting?",
    ],
    tips: ["Drafts save themselves, so a half-written report is not lost."],
  },
  "team:compliance": {
    title: "Team compliance",
    summary: "Read and acknowledge the SOPs that apply to you, borrow library books, and request overnight office use.",
    steps: ["Open the SOPs tab and filter to your department", "Read the SOP in full", "Acknowledge it to record that you have"],
    sections: [
      { label: "SOPs", purpose: "Everything assigned to you: department, general office, generalist, invited and task SOPs." },
      { label: "Library", purpose: "Books you can request, with a study period of up to 21 days." },
      { label: "Extra approvals", purpose: "Your requests, including overnight office requests." },
      { label: "SOP viewer", purpose: "The SOP body with its images or video, and the acknowledgement note." },
    ],
    actions: [
      { label: "Acknowledge SOP", purpose: "Records that you have read this version of the SOP.", steps: ["Read the whole SOP", "Choose Acknowledge SOP", "Check it no longer shows as outstanding"] },
      { label: "Request this book", purpose: "Opens a loan request for that book.", steps: ["Choose Request this book", "Set the study period", "Choose Submit request"] },
      { label: "Sign and submit", purpose: "Signs and submits an overnight office request.", steps: ["Give the reason and dates", "Sign the request", "Choose Sign and submit"] },
      { label: "Cancel request", purpose: "Withdraws a request you have made.", steps: ["Open My requests", "Find the pending request", "Choose Cancel request"] },
    ],
    questions: [
      "Which SOPs am I still required to acknowledge?",
      "How long can I keep a library book?",
      "Why is this book currently unavailable?",
      "What do I need to give for an overnight office request?",
    ],
    tips: ["Acknowledgement is per version: an updated SOP needs acknowledging again."],
  },
  "team:equipment": {
    title: "My equipment",
    summary: "The company devices in your care, each with a custody agreement you sign.",
    steps: ["Open the device waiting for a signature", "Read the agreement in full", "Type your name, draw your signature, and accept"],
    sections: [
      { label: "Pending banner", purpose: "Tells you how many devices are waiting for your signature." },
      { label: "Device card", purpose: "Device name, asset tag, type, serial number, the date assigned and any note." },
      { label: "Status badge", purpose: "Signed with its date, Declined, or Awaiting your signature." },
      { label: "Sign panel", purpose: "The full agreement, an acceptance box, your name and a signature you draw." },
    ],
    actions: [
      { label: "Read and sign", purpose: "Opens the agreement and the signing panel.", steps: ["Choose Read and sign", "Read the agreement", "Complete the panel below it"] },
      { label: "Sign and accept", purpose: "Records your acceptance with your name, signature and the time.", steps: ["Tick the acceptance box", "Type your full name and draw your signature", "Choose Sign and accept"] },
      { label: "Clear", purpose: "Erases the signature you drew so you can draw it again.", steps: ["Choose Clear", "Draw the signature again", "Continue"] },
      { label: "View the agreement", purpose: "Shows the exact text of an agreement you already signed.", steps: ["Find the signed device", "Choose View the agreement", "Read the stored copy"] },
    ],
    questions: [
      "What am I liable for if this device is lost or damaged?",
      "Which of my devices still need a signature?",
      "Can I get a copy of the agreement I signed?",
      "Why is the Sign and accept button greyed out?",
    ],
    tips: ["The button stays disabled until the box is ticked, your name is typed and a signature is drawn.", "Fair wear and tear from normal use is not treated as damage."],
  },
  "team:protect-docs": {
    title: "Protect docs",
    summary: "A vault for notes, files, contracts, briefs and assets, with who can see each one set per document.",
    steps: ["Create the protected doc and choose its kind", "Set who can see it", "Add a password if it needs one"],
    sections: [
      { label: "Document list", purpose: "Your protected docs with their kind and visibility badges." },
      { label: "Kind", purpose: "Note, Asset, Brief or Contract." },
      { label: "Visibility", purpose: "Public, All team, Department, Specific members, or Admin only." },
      { label: "Locked doc", purpose: "A password-protected doc asks for its password before opening." },
    ],
    actions: [
      { label: "New protected doc", purpose: "Creates a doc with a body, an optional file and an optional password.", steps: ["Choose New protected doc", "Set the kind and visibility", "Add the body or file and save"] },
      { label: "Unlock", purpose: "Opens a password-protected document.", steps: ["Open the doc", "Enter its password", "Choose Unlock"] },
    ],
    questions: [
      "Who can see a doc set to Department visibility?",
      "What happens if I forget a doc's password?",
      "Can I attach a file instead of typing a body?",
      "Which docs here can I reference in my weekly report?",
    ],
  },
  "team:cmeet": {
    title: "cMeet",
    summary: "Start a meeting now, schedule one, or join with a room code.",
    steps: ["Choose an instant meeting or schedule one", "Invite the people who need to be there", "Join at the time"],
    sections: [
      { label: "Meeting list", purpose: "Your meetings as live, scheduled, ended, archived or awaiting approval." },
      { label: "Schedule form", purpose: "Meeting topic, date and time, with suggested topics." },
      { label: "Invite team members", purpose: "A searchable picker for who should attend." },
      { label: "Join with a code", purpose: "Paste a room code someone sent you, such as quick-bird-42." },
    ],
    actions: [
      { label: "Instant meeting", purpose: "Creates a room and opens it immediately.", steps: ["Choose Instant meeting", "Invite anyone needed", "Share the room code"] },
      { label: "Schedule for later", purpose: "Creates a meeting at a set date and time.", steps: ["Set the topic and time", "Invite the attendees", "Choose Schedule for later"] },
      { label: "Join", purpose: "Enters an existing room.", steps: ["Find the meeting or paste its code", "Choose Join", "Allow camera and microphone"] },
    ],
    questions: [
      "Why does my meeting say awaiting admin approval?",
      "How do I join using only a room code?",
      "Can I invite specific teammates to a scheduled call?",
      "Where do ended meetings go?",
    ],
  },
  "team:cdocs": {
    title: "cDocs",
    summary: "Create, save and share branded documents, from a blank page or a template.",
    steps: ["Start a new document or pick a template", "Write and let it save", "Share it in chat or by link"],
    sections: [
      { label: "Tabs", purpose: "Active documents, templates, and archived ones." },
      { label: "Document list", purpose: "Title, when it was last edited, and its category tag." },
      { label: "Template picker", purpose: "Categories and starters to begin from." },
      { label: "Bulk bar", purpose: "Archive, restore or delete the documents you have selected." },
    ],
    actions: [
      { label: "New document", purpose: "Creates a blank document.", steps: ["Choose New document", "Give it a title", "Write, it saves as you go"] },
      { label: "Use template", purpose: "Starts from a prepared layout.", steps: ["Choose Use template", "Pick the category and starter", "Replace the placeholder content"] },
      { label: "Share in chat", purpose: "Posts the document link into a chat thread.", steps: ["Open the document", "Choose Share in chat", "Pick the thread"] },
      { label: "Copy share link", purpose: "Copies the public link to the document.", steps: ["Choose Copy share link", "Check who you are sending it to", "Paste it"] },
    ],
    questions: [
      "Which template should I use for this document?",
      "Does the share link work for people outside the team?",
      "How do I send this document for signature?",
      "Can I recover something I archived?",
    ],
  },
  "team:csign": {
    title: "cSign",
    summary: "Send documents for signature and track what is waiting on you or on someone else.",
    steps: ["Open the To sign tab for anything waiting on you", "Use New request to send one out", "Download the signed PDF when it is complete"],
    sections: [
      { label: "Tabs", purpose: "All requests, sent by me, and to sign." },
      { label: "Request list", purpose: "Document title, status, when it was created and the signer." },
      { label: "Send for signature", purpose: "Pick the document and the signers, by team member or external email." },
      { label: "Request sent panel", purpose: "The secure link for each signer to share." },
    ],
    actions: [
      { label: "New request", purpose: "Sends a document out for signature.", steps: ["Choose New request", "Pick the document and signers", "Send and share the links"] },
      { label: "Download signed PDF", purpose: "Downloads the completed signed document.", steps: ["Open the signed request", "Choose Download signed PDF", "Store it where it belongs"] },
    ],
    questions: [
      "Which requests are waiting on my signature?",
      "How do I send a document to an external client email?",
      "Can I delete a request that was already signed?",
      "Where do I get the signed PDF?",
    ],
    tips: ["A signed request cannot be deleted, only archived."],
  },
  "team:settings": {
    title: "Settings",
    summary: "Your profile and photo, your password, and the language the portal uses.",
    steps: ["Update your profile and save", "Change your password under Security", "Set your language if you prefer another"],
    sections: [
      { label: "Profile", purpose: "Photo, full name, role title, phone, location and bio." },
      { label: "Email verification", purpose: "Verifies the email address on your account." },
      { label: "Security", purpose: "Change your password, at least 8 characters." },
      { label: "Language", purpose: "The locale the portal is shown in." },
    ],
    actions: [
      { label: "Change photo", purpose: "Uploads a PNG, JPG, WEBP or GIF up to 4MB.", steps: ["Choose Change photo", "Pick the image", "Save changes"] },
      { label: "Save changes", purpose: "Saves your profile fields.", steps: ["Edit the fields", "Choose Save changes", "Wait for the confirmation"] },
      { label: "Change password", purpose: "Sets a new password after your current one.", steps: ["Enter your current password", "Enter and confirm the new one", "Choose Change password"] },
    ],
    questions: [
      "How do I verify my email address?",
      "Why will my new photo not upload?",
      "Why does the portal still show my old role title?",
      "How do I change the portal language?",
    ],
  },
  "team:screening": {
    title: "Screening questions",
    summary: "Set the objective test questions for the hiring roles assigned to you.",
    steps: ["Pick the role from the selector", "Write or edit its questions", "Save so candidates receive them"],
    sections: [
      { label: "Role selector", purpose: "The roles assigned to you, grouped by employment type." },
      { label: "Question bank", purpose: "The objective questions candidates answer for that role." },
    ],
    actions: [
      { label: "Role dropdown", purpose: "Switches to another assigned role's questions.", steps: ["Open the dropdown", "Pick the role", "Edit its questions"] },
    ],
    questions: [
      "Why do I see no roles assigned to me?",
      "What does draft mean beside a role?",
      "How many questions should this role have?",
      "Do candidates see these questions immediately?",
    ],
  },
};

/** The admin portal: finance, the board and the deals pipeline. */
const ADMIN_MONEY_GUIDES: Record<string, PageGuide> = {
  "admin:dashboard": {
    title: "Admin dashboard",
    summary: "Platform numbers, the quick actions your permissions allow, and the uploaded works table.",
    steps: ["Read the stat tiles for today", "Use a quick action for what needs attention", "Search the works table for a specific piece"],
    sections: [
      { label: "Stat tiles", purpose: "Client sign-ups, clients checked in today, platform calls, works, categories, traffic and countries." },
      { label: "Quick actions", purpose: "Pills with unread badges. Each one only appears if your role allows it." },
      { label: "Uploaded works", purpose: "Searchable table of works, sharing the header search box." },
      { label: "Featured brands", purpose: "The brands currently featured beside the works table." },
    ],
    actions: [
      { label: "Feature Brands", purpose: "Opens the featured works picker.", steps: ["Choose Feature Brands", "Pick the works to feature", "Save"] },
      { label: "Manage Ads", purpose: "Opens the advertisement settings.", steps: ["Choose Manage Ads", "Set the advert", "Save"] },
      { label: "Chat/Meet", purpose: "Opens client messages.", steps: ["Choose Chat/Meet", "Pick the conversation", "Reply"] },
    ],
    questions: [
      "Why is my quick actions row missing some pills?",
      "Which countries make up today's traffic number?",
      "Do the sign-up and call figures refresh on their own?",
      "Why do I see only my permissions page instead of the dashboard?",
    ],
    tips: ["A sub-admin without dashboard permission sees their role and permissions instead."],
  },
  "admin:finance": {
    title: "Finance home",
    summary: "Revenue, expenses and profit at a glance, payments waiting on you, and the way into every finance tool.",
    steps: ["Clear any payments awaiting confirmation", "Check the overdue and outstanding alerts", "Open the tool you need from Quick Access"],
    sections: [
      { label: "Hero cards", purpose: "Revenue from paid invoices and inflow, expenses including contractors and payroll, and net profit or loss." },
      { label: "Pending payment confirmations", purpose: "Payments clients say they have made, with amount, invoice number and transfer reference." },
      { label: "Alerts", purpose: "How many invoices are overdue and how much is outstanding on unpaid sent invoices." },
      { label: "Quick Access", purpose: "Projects, price list, invoices, quotations, inflow, contractors, expenditures, payroll and detailed reports." },
    ],
    actions: [
      { label: "Confirm payment", purpose: "Confirms receipt, marks the invoice paid and issues a receipt.", steps: ["Check the money actually arrived", "Match the transfer reference", "Choose Confirm payment"] },
      { label: "Reject", purpose: "Rejects the submission. The invoice stays unpaid.", steps: ["Confirm no payment arrived", "Choose Reject", "Tell the client what to do next"] },
      { label: "Currency selector", purpose: "Restates every figure in the currency you choose. Stored amounts do not change.", steps: ["Pick the currency", "Read the converted figures", "Switch back when done"] },
    ],
    questions: [
      "Does revenue count partially paid invoices or only fully paid ones?",
      "What happens to the client if I reject their payment submission?",
      "Why is payroll included in total expenses here?",
      "Does switching display currency change stored amounts?",
    ],
  },
  "admin:finance/invoices": {
    title: "Invoices",
    summary: "Raise, send, chase and reconcile client invoices, and validate the payments clients submit.",
    steps: ["Clear anything in Payments awaiting validation", "Raise or open the invoice you need", "Record the payment or send a reminder"],
    sections: [
      { label: "Stat cards", purpose: "Total invoices, the amount paid, and the amount outstanding." },
      { label: "Payments awaiting admin validation", purpose: "Amber banner of payments clients have submitted for you to confirm." },
      { label: "Table", purpose: "Invoice number, client, issue date, total and status, with the actions for each row." },
      { label: "Bulk bar", purpose: "Appears when rows are ticked, for changing several invoices at once." },
    ],
    actions: [
      { label: "New Invoice", purpose: "Opens a blank invoice.", steps: ["Choose New Invoice", "Add the client and line items", "Save, then send it"] },
      { label: "Record payment", purpose: "Records money received against that invoice.", steps: ["Open the invoice row", "Choose Record payment", "Enter the amount and date"] },
      { label: "Confirm", purpose: "Approves a payment the client submitted, marking the invoice paid.", steps: ["Check the transfer reference", "Choose Confirm", "A receipt is issued"] },
      { label: "Reminder", purpose: "Sends a payment reminder by client chat and email.", steps: ["Check the invoice is genuinely unpaid", "Choose Reminder", "Watch for a reply"] },
      { label: "Email", purpose: "Emails the saved invoice to the client.", steps: ["Save the invoice first", "Choose Email", "Confirm it sent"] },
      { label: "Mark Paid", purpose: "Bulk status change on the invoices you have selected.", steps: ["Tick the invoices", "Choose Mark Paid, Mark Sent or Cancel", "Check the statuses updated"] },
    ],
    questions: [
      "What is the difference between Confirm and Record payment?",
      "Why is the Email button disabled on this invoice?",
      "Does a bulk Mark Paid notify the client?",
      "How long is a new invoice valid before it cancels itself?",
    ],
    tips: ["New invoices are valid for 28 days and cancel automatically if unpaid. Part-paid invoices are never cancelled.", "Cancelled invoices carry no balance, so they do not count toward outstanding."],
  },
  "admin:finance/quotations": {
    title: "Quotations",
    summary: "Estimates that stay out of the books until you convert one into an invoice.",
    steps: ["Raise the quotation and send it", "Mark it accepted when the client agrees", "Convert it into an invoice"],
    sections: [
      { label: "Stat cards", purpose: "Total quotations, how many are accepted, and the estimated pipeline." },
      { label: "Table", purpose: "Quotation, project or company, client, issue date, estimate and status." },
      { label: "Bulk bar", purpose: "Batch actions for the quotations you have selected." },
    ],
    actions: [
      { label: "New Quotation", purpose: "Opens a blank quotation.", steps: ["Choose New Quotation", "Add the client and estimate", "Save and email it"] },
      { label: "Convert", purpose: "Turns the quotation into an invoice. It then reads Open Invoice.", steps: ["Confirm the client accepted", "Choose Convert", "Check the invoice created"] },
      { label: "Email", purpose: "Emails the quotation to the client.", steps: ["Open the quotation", "Choose Email", "Confirm it sent"] },
    ],
    questions: [
      "Does converting a quotation lock the estimate figures?",
      "Why is the accepted count different from converted?",
      "Is the estimated pipeline in my display currency or the original?",
      "Can I re-email a quotation after marking it accepted?",
    ],
  },
  "admin:finance/expenditures": {
    title: "Expenditures",
    summary: "Every outgoing spend, one-off or recurring.",
    steps: ["Add the spend with its category and amount", "Set a recurrence if it repeats", "Check it against the totals"],
    sections: [
      { label: "Stat cards", purpose: "Total spend, how much is recurring and how much is one-off." },
      { label: "Table", purpose: "Title, category, date, amount in its original currency, and type." },
      { label: "Recurrence controls", purpose: "Daily, weekly, monthly, quarterly, yearly or a custom interval." },
    ],
    actions: [
      { label: "New Expenditure", purpose: "Opens a blank expenditure.", steps: ["Choose New Expenditure", "Set title, category and amount", "Save"] },
      { label: "Recurring expense toggle", purpose: "Reveals the cycle and interval fields.", steps: ["Turn the toggle on", "Pick the cycle", "Save"] },
      { label: "Edit expenditure", purpose: "Reopens the entry for changes.", steps: ["Choose the pencil", "Change the fields", "Save"] },
    ],
    questions: [
      "Does marking an expense recurring create future entries automatically?",
      "What does the custom recurrence interval mean in days?",
      "Why does the amount show an original line underneath?",
      "Should contractor payments be logged here or under Contractors?",
    ],
  },
  "admin:finance/payroll": {
    title: "Payroll",
    summary: "Payroll runs and salaried staff records, with an approval step before any salary edit.",
    steps: ["Add or check the employee records", "Create the run for the period", "Move it to paid once money has gone out"],
    sections: [
      { label: "Payroll runs", purpose: "Each run with its period, status and converted total." },
      { label: "Employees", purpose: "Name, role, bank, account and salary." },
      { label: "Edit approval step", purpose: "A reason and approval date, kept in the payroll audit history." },
    ],
    actions: [
      { label: "New run", purpose: "Creates a payroll batch for a period.", steps: ["Choose New run", "Name the period", "Choose Create"] },
      { label: "New employee", purpose: "Adds a salaried staff member.", steps: ["Choose New employee", "Enter their details and salary", "Save"] },
      { label: "Edit payroll details", purpose: "Starts the approval-then-edit flow for a salary change.", steps: ["Choose the pencil", "Give the reason and approval date", "Continue to details and save"] },
    ],
    questions: [
      "Do I need an approval reason just to fix a bank account number?",
      "What moves a run from processed to paid?",
      "Does a new employee automatically join the next run?",
      "Where can I see who approved a past salary change?",
    ],
  },
  "admin:finance/pricelists": {
    title: "Pricelists",
    summary: "Build a shareable client pricelist from scratch or from an uploaded pricing PDF.",
    steps: ["Choose the template and currencies", "Start blank or upload a PDF", "Publish, then share the link"],
    sections: [
      { label: "Create a pricelist", purpose: "Template choice of Packages or Table, and which currencies to include." },
      { label: "Currency note", purpose: "Choosing NGN fills in USD and RWF automatically. Pick USD or RWF alone for one currency." },
      { label: "Pricelist cards", purpose: "Each list with its title and how many packages, add-ons or rows it holds." },
    ],
    actions: [
      { label: "Start blank", purpose: "Creates an empty pricelist in the chosen template.", steps: ["Pick the template and currencies", "Choose Start blank", "Add the packages or rows"] },
      { label: "Upload PDF", purpose: "Extracts packages, add-ons, delivery and terms from a pricing PDF for you to check.", steps: ["Choose Upload PDF", "Select the file", "Check every extracted figure before publishing"] },
      { label: "Copy link", purpose: "Copies the public pricelist link.", steps: ["Publish the list first", "Choose Copy link", "Send it to the client"] },
    ],
    questions: [
      "How accurate is the PDF extraction, and what must I check?",
      "Why is there no Open button on this pricelist?",
      "Does Copy link work before the list is published?",
      "Should this be Packages or Table for print sizes?",
    ],
  },
  "admin:finance/audit": {
    title: "Financial audit",
    summary: "Period reporting: profit and loss, balance sheet, ledger, tax compliance and bank reconciliation.",
    steps: ["Set the period filters", "Generate the report you need", "Upload a bank statement to reconcile"],
    sections: [
      { label: "Period filters", purpose: "Year, quarter or a custom from and to date." },
      { label: "Generate reports", purpose: "Profit and loss, balance sheet, general ledger, or export everything." },
      { label: "Financial analysis", purpose: "Profit margin, expense ratio, invoice tax captured and the cash collection gap." },
      { label: "Tax compliance", purpose: "Taxable revenue, invoice tax, VAT estimate, TIN, tax office, filing target and status." },
      { label: "Bank statements", purpose: "Uploaded statements with each line matched, or flagged as unmatched or duplicate." },
    ],
    actions: [
      { label: "Upload and reconcile", purpose: "Processes a statement and matches its lines against invoices.", steps: ["Choose Upload Statement", "Select the statement file", "Review matches, duplicates and anything unmatched"] },
      { label: "Download", purpose: "Exports the current report as CSV, PDF or XLS.", steps: ["Set the period", "Choose the report", "Choose Download and pick the format"] },
      { label: "View details", purpose: "Opens a statement's transaction list.", steps: ["Find the statement", "Choose View details", "Check each reconciliation result"] },
    ],
    questions: [
      "Which period do the tax compliance figures cover?",
      "Why did a statement line not match an invoice?",
      "Is the VAT estimate calculated or entered by hand?",
      "Does changing filing status to Filed record anything elsewhere?",
    ],
  },
  "admin:executive-board": {
    title: "Executive board",
    summary: "Board-level view of budgets, expansion, targets, revenue models and the document vault.",
    steps: ["Read the stat tiles", "Open the section that needs work", "Export a PDF for the meeting"],
    sections: [
      { label: "Stat tiles", purpose: "Planned spend, actual spend, expansion forecast, targets at risk and live share links." },
      { label: "Section cards", purpose: "Budgets, expansion budgets, targets, revenue models and the vault, each with counts." },
      { label: "Execution progress", purpose: "How far each revenue model has got through its steps." },
    ],
    actions: [
      { label: "Export PDF", purpose: "Builds a branded overview PDF.", steps: ["Set the view currency", "Choose Export PDF", "Wait for it to build"] },
      { label: "Currency toggle", purpose: "Recalculates every figure into the currency you pick.", steps: ["Choose the currency", "Read the restated figures", "Export if needed"] },
    ],
    questions: [
      "Are lines in other currencies converted or counted at face value?",
      "Which targets count as needing attention?",
      "Does the expansion forecast exclude launched plans?",
      "How many share links are still live right now?",
    ],
  },
  "admin:executive-board/budgets": {
    title: "Budgets",
    summary: "Planned against actual spend, line by line, with the variance made obvious.",
    steps: ["Add the budget line with its planned figure", "Enter actuals as money is spent", "Watch the variance"],
    sections: [
      { label: "Totals strip", purpose: "Planned, actual and variance. Variance turns red when negative." },
      { label: "Table", purpose: "Line, period, planned, actual, variance and status." },
      { label: "Budget form", purpose: "Title, category, period, owner, currency, planned and actual figures, status and notes." },
    ],
    actions: [
      { label: "New budget line", purpose: "Opens a blank budget form.", steps: ["Choose New budget line", "Fill in the planned figure and owner", "Save"] },
      { label: "Download", purpose: "Exports that budget line and its implementation plan.", steps: ["Find the row", "Choose Download", "Share it with the owner"] },
    ],
    questions: [
      "Should actuals be entered in the line's own currency?",
      "What does a negative variance mean on this line?",
      "Who is the owner field meant to name?",
      "Does the row download include the implementation plan?",
    ],
  },
  "admin:executive-board/expansion-budgets": {
    title: "Expansion budgets",
    summary: "Planned investment before it reaches the operating budget: markets, offices, hiring, products and acquisitions.",
    steps: ["Add the plan with its requirement and target start", "Record committed funding", "Track the funding gap and readiness"],
    sections: [
      { label: "Stat tiles", purpose: "Future plans, forecast requirement, committed funding with the gap, and the next planned start." },
      { label: "Stage filter", purpose: "Narrows the table to one stage and shows how many of the total are listed." },
      { label: "Table", purpose: "Plan, timeline, requirement, committed, funding gap, readiness and stage." },
    ],
    actions: [
      { label: "New expansion budget", purpose: "Opens a blank plan. A title and target start are required.", steps: ["Choose New expansion budget", "Fill in the title, market and target start", "Save"] },
      { label: "Download", purpose: "Exports the plan and how it is to be carried out.", steps: ["Find the plan", "Choose Download", "Circulate it"] },
      { label: "Discard draft", purpose: "Throws away a recovered unsaved draft.", steps: ["Read what the draft holds", "Choose Discard draft", "Start again"] },
    ],
    questions: [
      "Does the forecast include cancelled and launched plans?",
      "How is the funding gap calculated?",
      "Why can I not save without a target start date?",
      "Where do I record the funding source details?",
    ],
  },
  "admin:executive-board/targets": {
    title: "Targets",
    summary: "The numbers the board holds itself to, with progress and status for each.",
    steps: ["Add the target with its metric and unit", "Link it to a revenue model if it belongs to one", "Update the current value as it moves"],
    sections: [
      { label: "Where every target stands", purpose: "Money targets summed in one currency, with other units counted separately." },
      { label: "Status chips", purpose: "How many are achieved, on track, or needing attention." },
      { label: "Target cards", purpose: "Each target with its progress and the revenue model it belongs to." },
    ],
    actions: [
      { label: "New target", purpose: "Opens a blank target form.", steps: ["Choose New target", "Set the metric, unit and figures", "Save"] },
      { label: "Model link", purpose: "Attaches the target to a revenue model, or leaves it unlinked.", steps: ["Open the target", "Pick the model", "Save"] },
    ],
    questions: [
      "Why can I not edit the title of a model-linked target?",
      "Are targets in other units included in the totals?",
      "What makes a target show as needing attention?",
      "Do I update the current value by hand each month?",
    ],
    tips: ["Every active revenue model carries a monthly target automatically."],
  },
  "admin:executive-board/revenue-models": {
    title: "Revenue models",
    summary: "How the company makes money, each model with a step-by-step execution plan.",
    steps: ["Add the model with its pricing basis and targets", "Add the steps that deliver it", "Mark steps done as they complete"],
    sections: [
      { label: "Model rows", purpose: "Name, status and how far through its steps it is." },
      { label: "Execution plan", purpose: "The steps for that model, each with its own status." },
      { label: "Model form", purpose: "Name, summary, pricing basis, status, currency, annual and monthly target, and owner." },
    ],
    actions: [
      { label: "New revenue model", purpose: "Opens a blank model form.", steps: ["Choose New revenue model", "Set the name, pricing basis and targets", "Save"] },
      { label: "Add step", purpose: "Adds an execution step to that model.", steps: ["Choose Add step", "Name it and set its status", "Save"] },
    ],
    questions: [
      "Does making a model active create its monthly target?",
      "What goes in pricing basis rather than summary?",
      "How is the plan progress percentage worked out?",
      "Can I reorder execution steps?",
    ],
  },
  "admin:executive-board/vault": {
    title: "Document vault",
    summary: "Folders and files for legal documents, password protected and shareable by link.",
    steps: ["Create the folder", "Upload the file or attach an existing document", "Share it with an expiry and download limit"],
    sections: [
      { label: "Folder cards", purpose: "Each folder, with open, share, edit and delete." },
      { label: "File cards", purpose: "Lock state, live link count, and the size or source." },
      { label: "Live share links", purpose: "Target, recipient, expiry and download count for every active link." },
      { label: "Share dialog", purpose: "Password, recipient email, note, days until expiry and maximum downloads." },
    ],
    actions: [
      { label: "Upload file", purpose: "Uploads a file with a title, kind, description and optional password.", steps: ["Choose Upload file", "Set the title and password", "Upload"] },
      { label: "Attach document", purpose: "Attaches an existing cDoc or an external link by search.", steps: ["Choose Attach document", "Search for it", "Attach"] },
      { label: "Share", purpose: "Creates a share link for a file or folder.", steps: ["Choose the link icon", "Set expiry, downloads and recipient", "Copy the link"] },
      { label: "Revoke", purpose: "Kills a live share link. The file itself stays.", steps: ["Find the link", "Choose Revoke", "Check the count drops"] },
    ],
    questions: [
      "If I password a folder, do the files inside inherit it?",
      "What does 0 mean in expiry days and max downloads?",
      "Will revoking a link delete the file too?",
      "Does a share link require the recipient email to open it?",
    ],
  },
  "admin:executive-board/letterhead": {
    title: "Create LH doc",
    summary: "Official CDS Space letters, written on the one company letterhead.",
    steps: ["Set the company letterhead once", "Create the document and write the letter", "Place the signature and export the PDF"],
    sections: [
      { label: "CDS Space letterhead", purpose: "The company design applied to every document here, with when it was set." },
      { label: "Documents", purpose: "Letters written in this section, kept separate from the CREATE studio's." },
      { label: "Exact PDF preview", purpose: "The real page layout, produced by the same engine as the export." },
      { label: "Signature", purpose: "Upload or paste a signature and drag it where it belongs." },
    ],
    actions: [
      { label: "Upload letterhead", purpose: "Sets or replaces the company letterhead for new documents.", steps: ["Choose Upload letterhead", "Pick a JPG, PNG, PDF or SVG up to 5MB", "New documents will use it"] },
      { label: "Export PDF", purpose: "Downloads the letter as it appears in the preview.", steps: ["Check the preview", "Choose Export PDF", "Save the file"] },
      { label: "Duplicate", purpose: "Copies this letter as a starting point for another.", steps: ["Open the letter", "Choose Duplicate", "Edit the copy"] },
    ],
    questions: [
      "How do I change the CDS Space letterhead?",
      "Does replacing the letterhead change letters already written?",
      "Why are there no letterhead upload boxes on the document?",
      "Where do these documents appear for other admins?",
    ],
    tips: ["Each document keeps its own copy of the design, so replacing the letterhead only affects new letters.", "Changing the company letterhead needs the Set Company Letterhead permission."],
  },
  "admin:deals": {
    title: "Deals",
    summary: "The way into proposals, brand audits, prospect generation, the checklist and the pipeline.",
    steps: ["Pick the tool you need", "Work from public evidence only", "Keep outreach under human control"],
    sections: [
      { label: "Tool cards", purpose: "Proposals, brand audits, prospect generation, prospect checklist and pipeline, each with a record count." },
      { label: "Responsible prospecting", purpose: "Public evidence only, no fabricated metrics, and outreach a person controls." },
    ],
    actions: [
      { label: "Proposals", purpose: "Opens the proposals tool.", steps: ["Choose Proposals", "Pick or create one", "Work through the slides"] },
      { label: "Prospect generation", purpose: "Opens the company directory research tool.", steps: ["Choose Prospect generation", "Add companies", "Run research"] },
    ],
    questions: [
      "What counts as public evidence for research here?",
      "Who reviews outreach before it is sent?",
      "Which count feeds the prospect pipeline card?",
      "Why is a card showing zero records?",
    ],
  },
  "admin:deals/proposals": {
    title: "Proposals",
    summary: "Nine-slide client proposals, editable throughout, sent as a branded link and PDF and tracked.",
    steps: ["Create the proposal for the prospect", "Generate it, then edit the slides", "Send it and watch the activity"],
    sections: [
      { label: "Stage cards", purpose: "All open, plus draft, ready, sent, viewed, negotiation, won and lost." },
      { label: "Create a proposal", purpose: "Prospect, brand name, website, social link, recipient email, title, cover and focus." },
      { label: "Edit tab", purpose: "Panels one to nine, from the title slide to the call to action, plus an internal note." },
      { label: "Activity tab", purpose: "Sends, views, last sent and opened, the event timeline and the evidence sources." },
    ],
    actions: [
      { label: "Generate proposal", purpose: "Researches the brand and writes the deck.", steps: ["Fill in the brand and links", "Choose Generate proposal", "Edit anything that needs your judgement"] },
      { label: "Send proposal", purpose: "Emails the branded link and PDF, and moves the stage to sent.", steps: ["Check every slide", "Choose Send proposal", "Watch the activity tab"] },
      { label: "PDF", purpose: "Downloads the proposal as a PDF.", steps: ["Open the proposal", "Choose PDF", "Save it"] },
    ],
    questions: [
      "Does sending overwrite my custom opening line?",
      "What does the viewed stage mean: the link or the email?",
      "Can I edit slide list items from the preview tab?",
      "Does the deal value here feed anything else?",
    ],
  },
  "admin:deals/brand-audits": {
    title: "Brand audits",
    summary: "A touchpoint-by-touchpoint brand diagnosis built from public evidence, then shared as a link or PDF.",
    steps: ["Generate the audit from the brand's public website", "Edit or refine the findings", "Turn the client link on and share it"],
    sections: [
      { label: "Generate form", purpose: "Brand name, public website (required) and social link." },
      { label: "Edit tab", purpose: "Opening summary, what it can become, the scorecard, touchpoints and recommendations." },
      { label: "Share tab", purpose: "The view-only client link, whether it is live, times opened and last opened." },
      { label: "Evidence sources", purpose: "The public links the audit was built from." },
    ],
    actions: [
      { label: "Research and generate audit", purpose: "Builds a new audit for that brand.", steps: ["Enter the brand and website", "Choose Research and generate audit", "Read it before sharing"] },
      { label: "Refine", purpose: "Re-researches and rewrites the report from your steer note.", steps: ["Write what to change", "Choose Refine", "Check your earlier edits survived"] },
      { label: "Link is live", purpose: "Turns the public client link on or off.", steps: ["Open the share tab", "Tick or untick Link is live", "Copy the link when on"] },
    ],
    questions: [
      "Does refining lose my manual edits to the report?",
      "Is the client link dead immediately when I untick it?",
      "Can I audit a brand with only a social link?",
      "Do the times refined counts show to the client?",
    ],
  },
  "admin:deals/prospect-generation": {
    title: "Prospect generation",
    summary: "A worldwide company directory built from public sources, researched in passes, then turned into outreach.",
    steps: ["Add companies by link, paste or official register", "Run a research pass over the queue", "Promote the good ones to the checklist"],
    sections: [
      { label: "Directory progress", purpose: "Total against target, how many are fully researched, and countries covered." },
      { label: "Stat tiles", purpose: "Awaiting research, confirmed trading, website needs work, reachable decision makers and more." },
      { label: "Research queue", purpose: "Short passes with a run log, countries covered and recent imports." },
      { label: "Company card", purpose: "Issues to fix, deal score, decision makers, emails, domain setup, competitors and sources." },
    ],
    actions: [
      { label: "Research queued", purpose: "Starts a research pass over the queue.", steps: ["Check the queue count", "Choose Research", "Keep the page open while it runs"] },
      { label: "Add to checklist", purpose: "Promotes a researched company to the prospect checklist.", steps: ["Read the findings", "Choose Add to checklist", "Set its next action there"] },
      { label: "Compose email", purpose: "Opens the composer. Sending delivers one message per recipient.", steps: ["Choose Compose email", "Check every address", "Send"] },
      { label: "Export this view", purpose: "Exports the filtered directory, or copies just the recipients.", steps: ["Filter the directory", "Choose Export this view", "Save the file"] },
    ],
    questions: [
      "Why must I keep this page open while research runs?",
      "What does website needs work actually cover?",
      "Which addresses does Copy recipients pick up?",
      "Will the same company in two countries create two records?",
    ],
  },
  "admin:deals/prospects": {
    title: "Prospect checklist",
    summary: "Potential clients, investors, influencers and industry leaders, each with a next action.",
    steps: ["Add the prospect under the right category", "Set the status and next action", "Draft a proposal when they are ready"],
    sections: [
      { label: "Category tabs", purpose: "All, potential clients, investors, influencers and industry leaders, with counts." },
      { label: "Prospect cards", purpose: "Status, name, company, next action, links and follow-up time." },
      { label: "Research brief", purpose: "Copied from prospect generation and editable, to correct or extend the findings." },
    ],
    actions: [
      { label: "Add prospect", purpose: "Opens the prospect form.", steps: ["Choose Add prospect", "Fill in the category, contact and next action", "Save"] },
      { label: "Draft a proposal", purpose: "Researches and writes a proposal, then opens it.", steps: ["Make sure a website or social link exists", "Choose the file icon", "Edit the draft"] },
    ],
    questions: [
      "Why does a proposal need a website or social link first?",
      "Did my last edit save if autosave showed an error?",
      "Should I edit the research brief or leave it as generated?",
      "What is the difference between ready and contacted?",
    ],
  },
  "admin:deals/pipeline": {
    title: "Prospect pipeline",
    summary: "Where each prospect stands, worked out from real events rather than moved by hand.",
    steps: ["Pick a stage tab", "Open a row for its timeline", "Follow the cross-links to act"],
    sections: [
      { label: "Stage tabs", purpose: "Everyone through to paid, project delivered and not going ahead." },
      { label: "Table", purpose: "Prospect, stage, progress, last touch and next action." },
      { label: "Timeline dialog", purpose: "The current stage with its date, the progress ladder, and what has happened." },
    ],
    actions: [
      { label: "Refresh", purpose: "Reloads the pipeline from the source records.", steps: ["Choose Refresh", "Wait for the reload", "Re-check the stage"] },
      { label: "Row click", purpose: "Opens that prospect's timeline.", steps: ["Click the row", "Read the events", "Follow a cross-link"] },
    ],
    questions: [
      "Why is this prospect still on emailed after we met them?",
      "What event moves someone into not going ahead?",
      "How current is the stage: do I need to refresh?",
      "Why does a row have no company details link?",
    ],
    tips: ["Nothing here is moved by hand. Stages come from outreach, audits, proposals, consultations, invoices and projects."],
  },
};

/** The admin portal: clients, content and day-to-day operations. */
const ADMIN_OPS_GUIDES: Record<string, PageGuide> = {
  "admin:clients": {
    title: "Sales hub",
    summary: "The way into client relationships, deliveries, orders and testimonials.",
    steps: ["Read the stat tiles", "Open the tool you need from Quick Access", "Check who was added recently"],
    sections: [
      { label: "Stat tiles", purpose: "Total clients and how many are active, total orders, testimonials and active engagements." },
      { label: "Quick Access", purpose: "Sales scripts, deliveries, the client list, mailings, orders and testimonials." },
      { label: "Recently added", purpose: "The last five clients with their brand, industries and date added." },
    ],
    actions: [
      { label: "Client Deliveries", purpose: "Opens the screen for sending finished files to a client.", steps: ["Choose Client Deliveries", "Build the delivery", "Send it"] },
      { label: "Unified Client List", purpose: "Opens the client directory.", steps: ["Choose Unified Client List", "Search for the client", "Open their record"] },
    ],
    questions: [
      "How many of our clients are currently active?",
      "Where do I send a finished project to a client?",
      "Which client was added most recently?",
      "How many testimonials do we have on record?",
    ],
  },
  "admin:clients/list": {
    title: "Client directory",
    summary: "One directory merging manually added clients with platform accounts, plus storage requests and birthdays.",
    steps: ["Find the client or add them", "Link a manual record to their platform account", "Keep status and contact details current"],
    sections: [
      { label: "Storage requests", purpose: "Clients asking for more workspace, to approve or decline." },
      { label: "Status tabs", purpose: "All, active, lead, inactive and archived." },
      { label: "Client table", purpose: "Account, name and brand, contact, industries, email, phone, birthday and status." },
      { label: "Merge", purpose: "Links a manual client to a platform account, with a duplicate detector." },
    ],
    actions: [
      { label: "New CRM Client", purpose: "Creates a manual client record.", steps: ["Choose New CRM Client", "Fill in the brand and contact details", "Save"] },
      { label: "Approve more space", purpose: "Raises that client's storage allowance.", steps: ["Read the request", "Choose Approve more space", "The client is told"] },
      { label: "Invite client to create an account", purpose: "Emails or creates a secure invitation link.", steps: ["Open the client", "Choose Invite", "Send the link"] },
      { label: "Link or merge a platform account", purpose: "Joins CRM history to their signup account.", steps: ["Open the merge modal", "Check the duplicate warning", "Confirm the merge"] },
    ],
    questions: [
      "Which of these clients has no account yet?",
      "Is this a duplicate of an existing platform account?",
      "Should I approve this storage request?",
      "Whose birthday is coming up?",
    ],
  },
  "admin:clients/deliveries": {
    title: "Client deliveries",
    summary: "Compose and send finished project files to one client or several.",
    steps: ["Pick the clients and delivery type", "Attach the files or link and set a cover", "Send, or approve one a team member submitted"],
    sections: [
      { label: "Delivery composer", purpose: "Receiving clients, delivery type, title, cover image and description." },
      { label: "Project link", purpose: "Attach to an existing project, or create one inline." },
      { label: "Files", purpose: "An external URL, already attached files, and newly uploaded work." },
      { label: "Delivery history", purpose: "Past handovers with their status and receiving client." },
    ],
    actions: [
      { label: "Send to client", purpose: "Delivers the files to the selected clients.", steps: ["Check the recipients and files", "Choose Send to client", "Confirm it appears in history"] },
      { label: "Approve and deliver", purpose: "Releases a delivery a team member submitted.", steps: ["Open the submitted draft", "Review every file", "Choose Approve and deliver"] },
      { label: "Upload cover", purpose: "Sets the image the client sees first.", steps: ["Choose Upload cover", "Pick the image", "Check the preview"] },
    ],
    questions: [
      "Did this client actually receive the final files?",
      "Which project should this handover be attached to?",
      "Can I still edit a delivery that was already sent?",
      "Why was one of my files skipped on upload?",
    ],
  },
  "admin:clients/mailings": {
    title: "Client mailings",
    summary: "Write, preview, send or schedule branded emails to clients, one message per recipient.",
    steps: ["Choose the recipients", "Write the message and attach a visual", "Send now or schedule it"],
    sections: [
      { label: "Choose recipients", purpose: "Search clients, select all, or paste extra addresses." },
      { label: "Composer", purpose: "Subject, message, AI rewrite and a cover image up to 8MB." },
      { label: "Schedule delivery", purpose: "The date and time in WAT the mailing goes out." },
      { label: "Recent mailings", purpose: "What was delivered, and anything that needs attention." },
    ],
    actions: [
      { label: "Send mailing", purpose: "Sends individual emails to every recipient.", steps: ["Check the recipient count", "Read the preview", "Choose Send mailing"] },
      { label: "Schedule email", purpose: "Queues delivery for a chosen WAT time.", steps: ["Set the date and time", "Choose Schedule email", "Check it under scheduled"] },
      { label: "Add and select client", purpose: "Creates a lead and selects them as a recipient.", steps: ["Enter their name, brand and email", "Choose Add and select client", "Continue writing"] },
    ],
    questions: [
      "How many recipients will actually receive this?",
      "Are any of the pasted addresses invalid?",
      "What time in WAT is this scheduled for?",
      "Why does that campaign say needs attention?",
    ],
  },
  "admin:clients/banners": {
    title: "Banner configuration",
    summary: "The banner catalogue clients order from: sizes, materials, prices and edit requests.",
    steps: ["Add or edit the size", "Set standard and premium prices", "Handle client edit requests"],
    sections: [
      { label: "Stat tiles", purpose: "Banner sizes, currencies and open edit requests." },
      { label: "Catalogue", purpose: "Name, description, width and height, quality, and indoor or outdoor." },
      { label: "Material prices", purpose: "Per-material price inputs for standard and premium." },
      { label: "Client edit requests", purpose: "Requests from clients and their review state." },
    ],
    actions: [
      { label: "Add size", purpose: "Appends a new banner size to the catalogue.", steps: ["Choose Add size", "Set dimensions and prices", "Save"] },
      { label: "Mark in review", purpose: "Flags a client edit request as being looked at.", steps: ["Open the request", "Choose Mark in review", "Close it when done"] },
    ],
    questions: [
      "Is this banner size visible to clients?",
      "What is the premium material price for this size?",
      "Are there open client edit requests?",
      "Does this size have a presentation image?",
    ],
  },
  "admin:clients/merch": {
    title: "Merch commerce",
    summary: "The merch catalogue: products, visuals, variants and pricing.",
    steps: ["Add the product and its variants", "Set production prices per currency", "Upload a visual and make it available"],
    sections: [
      { label: "Catalogue", purpose: "Product name, unit label, client-facing description and presentation image." },
      { label: "Variants", purpose: "Sizes and colours, as comma-separated lists." },
      { label: "Prices", purpose: "Production price per unit, and an optional CDS Space design fee." },
    ],
    actions: [
      { label: "Add merch", purpose: "Adds a new product row.", steps: ["Choose Add merch", "Set the name, variants and prices", "Save changes"] },
      { label: "Upload visual", purpose: "Uploads the product presentation image.", steps: ["Choose Upload visual", "Pick the image", "Save changes"] },
      { label: "Available toggle", purpose: "Shows or hides the product from clients.", steps: ["Check prices are complete", "Flip to Available", "Save changes"] },
    ],
    questions: [
      "Is this product live for clients right now?",
      "Which currency prices are missing?",
      "Should we charge a design fee on this product?",
      "Which products have no presentation visual?",
    ],
  },
  "admin:clients/modules": {
    title: "Dashboard modules",
    summary: "Which dashboard modules clients see, set for everyone or for one client.",
    steps: ["Set the platform defaults", "Search for a client to override", "Save"],
    sections: [
      { label: "Stat tiles", purpose: "Visible modules, hidden modules, and how many clients have overrides." },
      { label: "Platform defaults", purpose: "Each module visible or hidden. Some are always available." },
      { label: "Per-client overrides", purpose: "Module visibility for one client alone." },
    ],
    actions: [
      { label: "Save defaults", purpose: "Saves platform-wide module visibility.", steps: ["Set each module", "Choose Save defaults", "Check the tiles update"] },
      { label: "Visible / Hidden toggle", purpose: "Turns a module on or off.", steps: ["Find the module", "Flip the toggle", "Save"] },
    ],
    questions: [
      "Which modules does a new client see by default?",
      "Can I hide a module for just one client?",
      "Which modules can never be turned off?",
      "How many clients have custom overrides?",
    ],
  },
  "admin:clients/sales-scripts": {
    title: "Sales scripts",
    summary: "Approved wording for sales, marketing and client experience, by channel, stage and market.",
    steps: ["Filter to the category and channel", "Copy the approved wording", "Add a new script if something is missing"],
    sections: [
      { label: "Category filter", purpose: "Sales, marketing, client experience, or all." },
      { label: "Script list", purpose: "Title, category, channel, stage, market, language and tags." },
      { label: "Script editor", purpose: "Title, usage guidance, approved wording and tags, with a saved draft." },
    ],
    actions: [
      { label: "New sales script", purpose: "Opens the editor for a new script.", steps: ["Choose New sales script", "Write the wording and guidance", "Save"] },
      { label: "Copy", purpose: "Copies the approved wording to your clipboard.", steps: ["Find the script", "Choose Copy", "Paste it into the channel"] },
    ],
    questions: [
      "Which script do I use for a first prospecting call?",
      "Is this wording approved for WhatsApp?",
      "Which market and language is this for?",
      "Do I have an unfinished draft script?",
    ],
  },
  "admin:clients/sales-settings": {
    title: "Sales settings",
    summary: "Bank accounts, delivery countries and zones, pickup points and offer codes.",
    steps: ["Add the bank account for that currency", "Set delivery countries, zones and pickup points", "Add any offer codes and save"],
    sections: [
      { label: "Bank accounts", purpose: "Account name and number, currency, bank, SWIFT, IBAN and routing." },
      { label: "Countries and overseas delivery", purpose: "Each country as fixed delivery or billed separately." },
      { label: "Delivery zones", purpose: "Zone label, state or region, and city." },
      { label: "Offer codes", purpose: "Code, percentage, description and optional start and expiry." },
    ],
    actions: [
      { label: "Add bank account", purpose: "Adds a payout account clients pay into.", steps: ["Choose Add bank account", "Enter the details and currency", "Save settings"] },
      { label: "Add offer", purpose: "Adds a special offer code.", steps: ["Choose Add offer", "Set the code, percentage and dates", "Save settings"] },
    ],
    questions: [
      "Which account do clients in this currency pay into?",
      "Is this country fixed-delivery or billed separately?",
      "Is this discount code still within its dates?",
      "What pickup addresses can I give a Lagos client?",
    ],
  },
  "admin:orders": {
    title: "Client orders",
    summary: "Every design, banner, merch and recurring order, with the payments waiting on validation.",
    steps: ["Clear payments awaiting validation", "Filter by type or status", "Open the order to act on it"],
    sections: [
      { label: "Stat tiles", purpose: "Total orders, pending, in progress and completed." },
      { label: "Payments awaiting validation", purpose: "Orders where the client has submitted payment details." },
      { label: "Orders table", purpose: "Order ID, type, title, client, status and date." },
    ],
    actions: [
      { label: "Open", purpose: "Opens the order detail page.", steps: ["Find the order", "Choose Open", "Work through its stages"] },
      { label: "Archive", purpose: "Bulk-archives the orders you have selected.", steps: ["Tick the finished orders", "Choose Archive", "Check they leave the list"] },
    ],
    questions: [
      "Which payments still need my validation?",
      "How many orders are in progress right now?",
      "What is the status of this client's banner order?",
      "Can I archive these finished orders in one go?",
    ],
  },
  "admin:consultations": {
    title: "Consultation requests",
    summary: "Incoming leads, their budget and how they heard of us, with kickoff scheduling and email.",
    steps: ["Read the lead's details", "Email them or schedule a kickoff", "Keep internal notes on the record"],
    sections: [
      { label: "Lead detail", purpose: "Company, email, WhatsApp, location, budget and how they heard of us." },
      { label: "Internal notes", purpose: "Private notes about the lead." },
      { label: "cMeet scheduling", purpose: "Topic, date and time, and the meeting platform." },
      { label: "Email composer", purpose: "Subject, message and the status to set." },
    ],
    actions: [
      { label: "Schedule cMeet", purpose: "Books a kickoff meeting with the lead.", steps: ["Set the topic and time", "Choose Schedule cMeet", "Confirm the invite"] },
      { label: "Compose email", purpose: "Opens the email form for that lead.", steps: ["Choose Compose email", "Write the message", "Choose Send email"] },
    ],
    questions: [
      "What budget did this lead give?",
      "Have we emailed this request yet?",
      "Is the kickoff meeting already scheduled?",
      "Which channel did this lead come through?",
    ],
  },
  "admin:announcements": {
    title: "Announcements",
    summary: "Broadcast a message to clients, the team, or one project team, in app and by email.",
    steps: ["Pick the audience and recipients", "Write the message and attach a visual", "Choose the channels and send"],
    sections: [
      { label: "Audience", purpose: "Clients, team members, or a project team." },
      { label: "Recipients", purpose: "Everyone, a department, or a hand-picked list." },
      { label: "Message", purpose: "Title, message and an optional link." },
      { label: "Channels", purpose: "In-app chat and email." },
    ],
    actions: [
      { label: "Send announcement", purpose: "Broadcasts to the selected audience and channels.", steps: ["Check the recipient list", "Pick the channels", "Choose Send announcement"] },
      { label: "Upload message visual", purpose: "Attaches an image to the chat and email.", steps: ["Choose Upload message visual", "Pick a file within the size limit", "Check the preview"] },
    ],
    questions: [
      "Will this go out by email as well as in app?",
      "Which clients are in this recipient list?",
      "Can I send this to only one department?",
      "Is my visual too large to attach?",
    ],
  },
  "admin:content-hub": {
    title: "Content hub",
    summary: "Plan, create, approve, schedule and hand off content.",
    steps: ["Check what is waiting for approval", "Look at what goes out next", "Create the next piece"],
    sections: [
      { label: "Status tiles", purpose: "Drafts, pending, approved, scheduled, published and archived." },
      { label: "Upcoming schedule", purpose: "The next posts with date, time, platform and who publishes." },
      { label: "Jump to", purpose: "Create content, visual library, studio, AI assistant and the approval queue." },
    ],
    actions: [
      { label: "Create Content", purpose: "Opens the seven-step creation wizard.", steps: ["Choose Create Content", "Work through the steps", "Save or schedule"] },
      { label: "Generate 7-day WOTD", purpose: "Schedules a week of Word of the Day posts.", steps: ["Check nothing clashes", "Choose Generate 7-day WOTD", "Review the calendar"] },
      { label: "Approval Queue", purpose: "Opens the content waiting for sign-off.", steps: ["Choose Approval Queue", "Read each item", "Approve or archive"] },
    ],
    questions: [
      "How many pieces are waiting for approval?",
      "What goes out tomorrow and who posts it?",
      "Is today's Word of the Day already scheduled?",
      "Are there drafts nobody has finished?",
    ],
  },
  "admin:content-hub/calendar": {
    title: "Content calendar",
    summary: "The month at a glance: everything scheduled and published.",
    steps: ["Move to the month you need", "Click a date to see that day", "Open a post to edit it"],
    sections: [
      { label: "Month grid", purpose: "Every day of the month with its items, today highlighted." },
      { label: "Selected day", purpose: "That day's posts with time, platform and status." },
    ],
    actions: [
      { label: "Click a date", purpose: "Loads that day's scheduled content.", steps: ["Click the date", "Read the day panel", "Open a post"] },
    ],
    questions: [
      "What is scheduled for this Friday?",
      "Who is posting this and on which platform?",
      "Are there gaps with nothing scheduled?",
      "Has this post already been published?",
    ],
  },
  "admin:content-hub/create": {
    title: "Create content",
    summary: "A seven-step wizard from source and brief to schedule and approval.",
    steps: ["Choose the source and write the brief", "Add media and the call to action", "Schedule it and assign a publisher"],
    sections: [
      { label: "Step bar", purpose: "Source, details, AI enhance, CTA, media, schedule and approval." },
      { label: "Brief fields", purpose: "Topic, audience, platform, tone and objective." },
      { label: "Media", purpose: "Choose from the visual library, or upload." },
      { label: "Schedule and assign", purpose: "The date and time, and who publishes it." },
    ],
    actions: [
      { label: "Generate with AI", purpose: "Drafts the copy from your brief.", steps: ["Complete the brief", "Choose Generate", "Edit what it produces"] },
      { label: "Approve & Schedule", purpose: "Approves and schedules in one step.", steps: ["Check the preview", "Set the time and publisher", "Choose Approve & Schedule"] },
      { label: "Save as Draft", purpose: "Stores the post without publishing.", steps: ["Choose Save as Draft", "Come back later", "Finish and schedule"] },
    ],
    questions: [
      "Which publisher should be assigned to this?",
      "Can I reuse an asset from the visual library?",
      "What does the caption look like when packaged?",
      "Do I approve now or just save a draft?",
    ],
  },
  "admin:content-hub/library": {
    title: "Content library",
    summary: "Every piece of content, filterable, with its publishing package and performance.",
    steps: ["Filter to what you need", "Move it through approve, schedule or published", "Record how it performed"],
    sections: [
      { label: "Filters", purpose: "Search, plus status, type and platform." },
      { label: "Content grid", purpose: "Title, caption excerpt and status." },
      { label: "Publishing package", purpose: "The packaged output handed to the publisher." },
      { label: "Performance notes", purpose: "Posted URL, reach, engagement and leads generated." },
    ],
    actions: [
      { label: "Approve", purpose: "Moves pending content to approved.", steps: ["Read the content", "Choose Approve", "Schedule it"] },
      { label: "Mark published", purpose: "Marks the item as published.", steps: ["Confirm it went out", "Choose Mark published", "Record the performance"] },
      { label: "Save performance", purpose: "Records URL, reach, engagement and leads.", steps: ["Gather the figures", "Enter them", "Choose Save performance"] },
    ],
    questions: [
      "Which approved posts are still unscheduled?",
      "What reach did this post get?",
      "Where is the publishing package for this?",
      "Can I filter to only Instagram content?",
    ],
  },
  "admin:content-hub/visual-library": {
    title: "Visual library",
    summary: "Photos and videos creators can use, marked available, used or archived.",
    steps: ["Upload with tags and notes", "Mark assets used as they go out", "Archive what is finished with"],
    sections: [
      { label: "Stat tiles", purpose: "Available, used and archived counts." },
      { label: "Asset grid", purpose: "Thumbnail, title, a video badge and a preview." },
      { label: "Upload fields", purpose: "Tags, comma separated, and notes." },
    ],
    actions: [
      { label: "Upload", purpose: "Uploads new photos or videos.", steps: ["Choose Upload", "Add tags and notes", "Check they appear"] },
      { label: "Mark used", purpose: "Marks an asset as used, or returns it to available.", steps: ["Select the asset", "Choose Mark used", "It moves category"] },
    ],
    questions: [
      "Which visuals are still available to use?",
      "Has this photo already been used?",
      "What tags did we give this asset?",
      "Can I bulk-archive this batch?",
    ],
  },
  "admin:content-hub/approvals": {
    title: "Approval queue",
    summary: "Content waiting for sign-off before it can be scheduled.",
    steps: ["Read the pending item", "Approve it, or archive it instead", "Schedule what you approved"],
    sections: [
      { label: "Pending list", purpose: "Everything carrying a pending approval badge." },
    ],
    actions: [
      { label: "Approve", purpose: "Approves the item and unlocks scheduling.", steps: ["Read it fully", "Choose Approve", "Schedule it in the library"] },
      { label: "Archive", purpose: "Sends it back to archive rather than approving.", steps: ["Decide it should not run", "Choose Archive", "Tell whoever drafted it"] },
    ],
    questions: [
      "What is still waiting on my sign-off?",
      "Does approving this let it be scheduled?",
      "Who drafted this piece?",
      "Should this be archived rather than approved?",
    ],
  },
  "admin:equipment-inventory": {
    title: "Equipment inventory",
    summary: "Company equipment, receipts, stored credentials and who holds each device.",
    steps: ["Add the equipment with its serial and asset tag", "Assign it to a team member", "Upload the receipt"],
    sections: [
      { label: "Stat tiles", purpose: "Total equipment, assigned, available and in maintenance." },
      { label: "Equipment table", purpose: "Equipment, type and serial, status, who holds it, location and receipt." },
      { label: "Assignment", purpose: "The team member in charge, the date, a note, the history and the custody agreement." },
      { label: "Equipment types", purpose: "The type names and descriptions you can choose from." },
    ],
    actions: [
      { label: "Add equipment", purpose: "Opens the new equipment form.", steps: ["Choose Add equipment", "Fill in the details and assignment", "Save"] },
      { label: "Upload receipt", purpose: "Attaches the purchase receipt.", steps: ["Open the equipment", "Choose Upload receipt", "Check it is listed"] },
      { label: "Manage types", purpose: "Adds, edits or removes equipment types.", steps: ["Choose Manage types", "Add or edit a type", "Save"] },
    ],
    questions: [
      "Who currently has this laptop?",
      "Has the holder signed the custody agreement?",
      "When does the warranty on this item expire?",
      "Which equipment is sitting in maintenance?",
    ],
    tips: ["Assigning a device raises a custody agreement the holder must sign, and the badge shows whether they have."],
  },
  "admin:legal": {
    title: "Legal documents",
    summary: "The live versions of each legal document, and who has signed what.",
    steps: ["Open the document to edit or publish a version", "Check the signed agreements", "Confirm the effective dates"],
    sections: [
      { label: "Document cards", purpose: "Privacy policy, terms, brand marketer agreement and AML policy, each with version and effective date." },
      { label: "Signed user agreements", purpose: "Who accepted which versions, and when." },
      { label: "Signed marketer agreements", purpose: "The same for marketers, with their code." },
    ],
    actions: [
      { label: "Document card", purpose: "Opens that document to edit and publish.", steps: ["Choose the document", "Edit the wording", "Publish the new version"] },
    ],
    questions: [
      "What version of the terms is currently live?",
      "Has this marketer signed all three documents?",
      "When did this user accept the agreement?",
      "What is the effective date of the privacy policy?",
    ],
  },
  "admin:audit-report": {
    title: "Audit and report",
    summary: "Platform activity analytics for a chosen period, with export.",
    steps: ["Set the period", "Read the metrics and trends", "Export as PNG or PDF"],
    sections: [
      { label: "Period filters", purpose: "Today, week, month, year, a quarter, or a custom range." },
      { label: "Metric cards", purpose: "Tracked events, logins, messages, invoices, works, active people and accounts." },
      { label: "Top actors", purpose: "The most active people in the range, searchable." },
      { label: "Data sources", purpose: "Which sources are available and which are not." },
    ],
    actions: [
      { label: "PDF", purpose: "Exports the report as a PDF, or PNG as an image.", steps: ["Set the period", "Choose PDF", "Save the file"] },
    ],
    questions: [
      "How much activity did we log this quarter?",
      "Who were the most active people this month?",
      "Which data sources are unavailable?",
      "Can I export this for the meeting?",
    ],
  },
  "admin:departments": {
    title: "Departments",
    summary: "Departments and their members. Each one gets a chat channel automatically.",
    steps: ["Create the department", "Add its members", "Open its chat channel"],
    sections: [
      { label: "Department list", purpose: "Every department, searchable." },
      { label: "New department", purpose: "Name and description." },
      { label: "Members", purpose: "Who is in it, and the team members you can add." },
    ],
    actions: [
      { label: "New department", purpose: "Creates a department and its chat channel.", steps: ["Choose New department", "Name it", "Choose Create"] },
      { label: "Open chat", purpose: "Opens that department's channel.", steps: ["Find the department", "Choose Open chat", "Post there"] },
    ],
    questions: [
      "Does this department already have a chat channel?",
      "Who is in the Design department?",
      "Can I add someone to two departments?",
      "What happens to the channel if I delete this?",
    ],
  },
  "admin:applications": {
    title: "Applicants",
    summary: "Job applicants, their documents and status, with bulk email and export.",
    steps: ["Filter to the role and status", "Read the application and admin notes", "Set a status or email them"],
    sections: [
      { label: "Filters", purpose: "Active or archived, status, work type and staff type." },
      { label: "Applicant table", purpose: "Role, contact, location, resume, portfolio, work links, status and tracking." },
      { label: "Detail panel", purpose: "The cover letter and an internal admin note." },
    ],
    actions: [
      { label: "Set Status", purpose: "Changes status on the applicants you selected.", steps: ["Tick the applicants", "Choose Set Status", "Pick the new status"] },
      { label: "Send Email", purpose: "Emails the selected applicants.", steps: ["Tick the applicants", "Write the subject and message", "Choose Send Email"] },
      { label: "Export CSV", purpose: "Downloads the current filtered list.", steps: ["Set the filters", "Choose Export CSV", "Save the file"] },
    ],
    questions: [
      "Which applicants are shortlisted for this role?",
      "Do any of these lack an email address?",
      "Where is this applicant's resume and portfolio?",
      "Can I export the current filtered list?",
    ],
  },
  "admin:hrm": {
    title: "HRM",
    summary: "HR operations: people, leave, attendance settings and the modules behind them.",
    steps: ["Clear pending leave requests", "Use a quick action for what is needed", "Open the module you need"],
    sections: [
      { label: "Stat cards", purpose: "Active roles, applications, sub-admins and pending leave." },
      { label: "Modules", purpose: "Team members, departments, attendance, applications, screening, roles, payroll, reports and compliance." },
      { label: "Leave requests", purpose: "Pending and approved leave with type, dates, reason and the clarification thread." },
      { label: "Bypass code", purpose: "A time-limited attendance bypass for one team member." },
    ],
    actions: [
      { label: "Review leave requests", purpose: "Opens pending leave for a decision.", steps: ["Choose Review leave requests", "Read the reason", "Approve or ask a question"] },
      { label: "Generate bypass code", purpose: "Issues a time-limited attendance bypass.", steps: ["Pick the team member and expiry", "Choose Generate bypass code", "Send it to them"] },
      { label: "Set office geofence", purpose: "Updates the office location and radius for attendance.", steps: ["Choose Set office geofence", "Set location and radius", "Save"] },
    ],
    questions: [
      "How many leave requests are waiting on me?",
      "Who needs an attendance bypass code today?",
      "Is the office geofence radius still correct?",
      "How many open roles do we have live?",
    ],
  },
  "admin:taskboard": {
    title: "Taskboard",
    summary: "Shared boards and lists for assigning and tracking team work.",
    steps: ["Create the board and scope it", "Add lists and tasks with owners", "Track them to complete"],
    sections: [
      { label: "Your boards", purpose: "Every board you can open." },
      { label: "Board form", purpose: "Name, description, colour and who it is for: everyone, a group or a department." },
      { label: "Lists and tasks", purpose: "List name, task title, assignees, due date, priority and instructions." },
      { label: "Documents", purpose: "Internal files, uploads and external links on a task." },
    ],
    actions: [
      { label: "Create board", purpose: "Creates a new taskboard.", steps: ["Choose Create board", "Name it and set its scope", "Add the first list"] },
      { label: "Create delivery", purpose: "Opens a delivery draft from that task.", steps: ["Open the task", "Choose Create delivery", "Upload the finished files"] },
      { label: "Mark task complete", purpose: "Closes out the task.", steps: ["Check the work", "Choose Mark task complete", "It shows as achieved"] },
    ],
    questions: [
      "Who is assigned to this task and when is it due?",
      "Can I limit this board to one department?",
      "How do I turn a task into a client delivery?",
      "Which documents are attached to this task?",
    ],
  },
  "admin:team-compliance": {
    title: "Team compliance",
    summary: "SOPs, the office library and extra approvals, from the people-operations side.",
    steps: ["Check what is pending", "Open SOPs, library or approvals", "Act on the oldest first"],
    sections: [
      { label: "Stat cards", purpose: "Published SOPs, available books, active loans and pending approvals." },
      { label: "Recently updated SOPs", purpose: "The last five SOPs with status and date." },
      { label: "Library", purpose: "Books, their source and condition." },
    ],
    actions: [
      { label: "Stat card", purpose: "Opens SOPs, library or approvals.", steps: ["Choose the card", "Work the list", "Come back to the overview"] },
    ],
    questions: [
      "How many SOPs are actually published?",
      "Which books are on loan right now?",
      "Are there extra approvals pending?",
      "Which SOP was updated most recently?",
    ],
  },
  "admin:csign": {
    title: "cSign",
    summary: "Every signature request in the company, and the way to raise a new one.",
    steps: ["Check what is still pending", "Raise a request to a team member or external email", "Copy the signing link and send it"],
    sections: [
      { label: "All requests", purpose: "Each request with status: pending, signed, cancelled or expired." },
      { label: "New request", purpose: "Team member or external email, with name and address." },
    ],
    actions: [
      { label: "New request", purpose: "Creates a signature request and copies its link.", steps: ["Choose New request", "Pick the signer", "Choose Create and share the link"] },
      { label: "Copy signing link", purpose: "Copies the link for that request.", steps: ["Find the request", "Choose Copy signing link", "Send it"] },
    ],
    questions: [
      "Which signature requests are still pending?",
      "Did this person sign, and when?",
      "How do I get the signing link to send them?",
      "Can I send this to someone outside the team?",
    ],
  },
  "admin:cdocs": {
    title: "cDocs",
    summary: "The company document directory, with views, comments and mentions.",
    steps: ["Search by title or department", "Open the doc", "Create a new one if needed"],
    sections: [
      { label: "Rollup cards", purpose: "Docs, views, open comments and mentions." },
      { label: "All docs", purpose: "Each doc with archived, pinned and department badges." },
    ],
    actions: [
      { label: "New doc", purpose: "Creates a new document.", steps: ["Choose New doc", "Title it", "Write"] },
    ],
    questions: [
      "Which docs have open comments?",
      "Where is the pinned doc for this department?",
      "Has this doc been archived?",
      "How many people viewed this doc?",
    ],
  },
  "admin:cmeet": {
    title: "cMeet",
    summary: "Company meetings: approve requests, schedule, join and terminate.",
    steps: ["Clear anything awaiting approval", "Create or join the meeting", "Terminate it when it should end"],
    sections: [
      { label: "Awaiting admin approval", purpose: "Meetings needing review before they can run." },
      { label: "Scheduled", purpose: "Upcoming meetings as live, ended, archived or awaiting approval." },
      { label: "Create meeting", purpose: "Topic, date and time, invitees, instant or scheduled." },
    ],
    actions: [
      { label: "Approve", purpose: "Approves a pending meeting request, or declines it.", steps: ["Read the request", "Choose Approve or Decline", "The requester is told"] },
      { label: "Terminate", purpose: "Ends a meeting that is running.", steps: ["Find the live meeting", "Choose Terminate", "Confirm"] },
    ],
    questions: [
      "Which meetings need my approval?",
      "Is this meeting live right now?",
      "Who is invited to this cMeet?",
      "How do I join using a room code?",
    ],
  },
  "admin:tutorials": {
    title: "Tutorials",
    summary: "The client learning centre: upload tutorial videos, add language tracks and captions, and publish them.",
    steps: ["Upload the video for a tool", "Add language versions and captions", "Publish it to client dashboards"],
    sections: [
      { label: "Upload form", purpose: "Tool, title, description, audio language, the video (MP4, MOV, M4V or WebM up to 100MB) and WebVTT captions up to 2MB." },
      { label: "Tutorial library", purpose: "Every tutorial with its status and its language and caption chips." },
      { label: "Edit tutorial details", purpose: "Changes the title, tool, description and publishing." },
    ],
    actions: [
      { label: "Upload tutorial", purpose: "Adds a new tutorial video, or a language version of an existing one.", steps: ["Choose Upload tutorial", "Pick the tool and language", "Upload the video and captions"] },
      { label: "Publish tutorial", purpose: "Makes the tutorial visible on client dashboards.", steps: ["Check it plays", "Choose Publish tutorial", "Confirm the status badge"] },
      { label: "Language", purpose: "Adds another audio track to the same tutorial.", steps: ["Open the tutorial", "Choose Language", "Upload that track"] },
    ],
    questions: [
      "How do I add a French audio track to this tutorial?",
      "Why is this tutorial not showing for clients yet?",
      "What video formats and size can I upload?",
      "How do I add captions to a tutorial?",
    ],
  },
};




/** The client dashboard, screen by screen. */
const CLIENT_GUIDES: Record<string, PageGuide> = {
  "client:dashboard": {
    title: "Dashboard",
    summary: "Your starting point: quick actions, recent deliveries, tutorials and your latest projects, invoices and messages.",
    steps: ["Pick a quick action for what you came to do", "Check recent deliveries for finished work", "Use View all to go deeper"],
    sections: [
      { label: "Quick actions", purpose: "Brand brief, new banner, create studio, subscription, order merch and brand identity." },
      { label: "Recent deliveries", purpose: "Your newest finished work with its file count and date." },
      { label: "Branding Word of the Day", purpose: "A word with its pronunciation, meaning and an example." },
      { label: "Widgets", purpose: "Current projects, past invoices and recent messages, each with View all." },
    ],
    actions: [
      { label: "Open cDrive", purpose: "Opens your drives and delivered files.", steps: ["Choose Open cDrive", "Pick the drive or delivery", "Download what you need"] },
      { label: "Save Card", purpose: "Downloads the Word of the Day as an image.", steps: ["Choose Save Card", "The image downloads", "Share it if you wish"] },
      { label: "Schedule now", purpose: "Takes you to book a session with the team.", steps: ["Choose Schedule now", "Give the topic and time", "Submit"] },
    ],
    questions: [
      "Why is my recent delivery not showing here yet?",
      "Where do I find my finished files?",
      "How do I book a session with the team?",
      "Where do the current project statuses come from?",
    ],
  },
  "client:orders": {
    title: "My orders",
    summary: "Every design, banner, merch and recurring request you have made, with its status.",
    steps: ["Filter by the type of order", "Read the status", "Use the relevant studio to change anything"],
    sections: [
      { label: "Stats row", purpose: "Total, pending, in progress and completed." },
      { label: "Type filter", purpose: "All, design, banner, merch or recurring." },
      { label: "Orders table", purpose: "Title, type, status and date." },
    ],
    actions: [
      { label: "Design / Banner / Merch", purpose: "Filters the table to that type of order.", steps: ["Choose the type", "Read the filtered list", "Choose All to go back"] },
    ],
    questions: [
      "What does awaiting quote mean for my banner order?",
      "Are subscription design requests included here?",
      "How often does the status update?",
      "Where do I pay for an order awaiting payment?",
    ],
    tips: ["This screen is for tracking. Changes are made in the studio the order came from."],
  },
  "client:invoices": {
    title: "My invoices",
    summary: "Every invoice on your account, with a way to pay or to get the receipt.",
    steps: ["Find the invoice", "Choose Pay now to settle it", "Use Receipt once it is paid"],
    sections: [
      { label: "Table", purpose: "Invoice, issue date, due date, status and total." },
      { label: "Status badges", purpose: "Paid, sent, overdue, draft or cancelled." },
    ],
    actions: [
      { label: "Pay now", purpose: "Opens the invoice at its payment section.", steps: ["Choose Pay now", "Pick the payment method", "Complete the payment"] },
      { label: "Receipt", purpose: "Opens the receipt for a paid invoice.", steps: ["Find the paid invoice", "Choose Receipt", "Save or print it"] },
    ],
    questions: [
      "Why is this invoice marked overdue?",
      "How long is my invoice valid before it cancels?",
      "Where do I download a receipt?",
      "Which payment methods can I use?",
    ],
    tips: ["Invoices are valid for 28 days from issue, and cancel automatically if unpaid.", "The list refreshes on its own every few seconds."],
  },
  "client:documents": {
    title: "cDrive",
    summary: "Your project drives, plus the finished work CDS Space has shared with you.",
    steps: ["Open a drive or a delivery", "Upload into a drive you can edit", "Share the drive link if needed"],
    sections: [
      { label: "Project drives", purpose: "Drives with their folder and file counts, marked can edit or view only." },
      { label: "Finished deliveries", purpose: "Completed work shared with you, to view or download." },
      { label: "Drive detail", purpose: "The folders and files inside, with sizes and image previews." },
    ],
    actions: [
      { label: "Create project drive", purpose: "Creates a new drive with a name and description.", steps: ["Choose Create project drive", "Name it", "Choose Create drive"] },
      { label: "Upload file", purpose: "Uploads into the open drive, if you have edit access.", steps: ["Open the drive", "Choose Upload file", "Wait for it to appear"] },
      { label: "Share drive", purpose: "Shares the drive by link.", steps: ["Open the drive", "Choose Share drive", "Send the link to the right person"] },
      { label: "Request more space", purpose: "Asks an admin to raise your storage.", steps: ["Choose Request more space", "Say how much you need", "Wait for approval"] },
    ],
    questions: [
      "Who at CDS Space can see the drive I create?",
      "Why is this drive view only for me?",
      "How much storage do I have?",
      "Does sharing the drive link make my files public?",
    ],
  },
  "client:cdrive": {
    title: "cDrive",
    summary: "Your project drives, plus the finished work CDS Space has shared with you.",
    steps: ["Open a drive or a delivery", "Upload into a drive you can edit", "Share the drive link if needed"],
    sections: [
      { label: "Project drives", purpose: "Drives with their folder and file counts, marked can edit or view only." },
      { label: "Finished deliveries", purpose: "Completed work shared with you, to view or download." },
    ],
    actions: [
      { label: "Create project drive", purpose: "Creates a new drive.", steps: ["Choose Create project drive", "Name it", "Choose Create drive"] },
      { label: "Upload file", purpose: "Uploads into a drive you can edit.", steps: ["Open the drive", "Choose Upload file", "Check it appears"] },
    ],
    questions: [
      "Is cDrive different from the Documents page?",
      "Can CDS Space upload into my drive too?",
      "How do I get a shareable link for one file?",
      "What happens when my storage is full?",
    ],
    tips: ["This is the same screen as Documents."],
  },
  "client:brand-brief": {
    title: "Your brand brief",
    summary: "The questionnaire that tells us about your brand, with private reference files.",
    steps: ["Work through the five sections", "Attach any reference files", "Submit it to CDS Space"],
    sections: [
      { label: "Summary cards", purpose: "Brief status, how complete it is, and how many reference files you have." },
      { label: "The form", purpose: "Five sections: the brand, who we can reach, audience and market, identity, and scope and goals." },
      { label: "Budget", purpose: "Your budget currency and range." },
      { label: "Reference files", purpose: "Images, PDFs, Office files or ZIPs up to 25MB each." },
    ],
    actions: [
      { label: "Save draft", purpose: "Saves the brief without submitting it.", steps: ["Fill in what you know", "Choose Save draft", "Come back later"] },
      { label: "Submit to CDS Space", purpose: "Sends the completed brief to the team.", steps: ["Check every section", "Choose Submit to CDS Space", "The team is told"] },
      { label: "Choose brand files", purpose: "Uploads reference files securely.", steps: ["Choose Choose brand files", "Pick the files", "Check they are listed"] },
    ],
    questions: [
      "Can I submit the brief and still edit it later?",
      "What counts toward the completion percentage?",
      "Who can see the files I attach?",
      "Should I set a budget range if I am unsure?",
    ],
  },
  "client:brand-identity": {
    title: "Brand identity",
    summary: "The finished identity systems delivered to you, ready to view, share or download.",
    steps: ["Open the delivery", "Download the files you need", "Share the public link if a supplier needs it"],
    sections: [
      { label: "Delivery card", purpose: "Client name, title, description and the date delivered." },
      { label: "Files", purpose: "Each delivered file with its type and size." },
    ],
    actions: [
      { label: "Download", purpose: "Downloads that file.", steps: ["Find the file", "Choose Download", "Save it"] },
      { label: "Public view", purpose: "Opens the delivery's public page.", steps: ["Choose Public view", "Check the contents", "Share the link if appropriate"] },
    ],
    questions: [
      "When will my finished identity appear here?",
      "Is the public link safe to send to my printer?",
      "Can I download the whole pack at once?",
      "Are source files included or only PDFs?",
    ],
  },
  "client:cmeet": {
    title: "cMeet",
    summary: "Start an audio or video room now, schedule one, or join with a link or code.",
    steps: ["Choose audio or video", "Set a title and any agenda", "Share the link with whoever should join"],
    sections: [
      { label: "Your meetings", purpose: "Rooms created here or from chat, with their time and status." },
      { label: "Join a meeting", purpose: "Paste a cMeet link or room code." },
      { label: "Meeting mode", purpose: "Title, audio only, a scheduled time, and agenda items." },
    ],
    actions: [
      { label: "Video cMeet", purpose: "Creates a video room, or Audio cMeet for audio only.", steps: ["Choose the type", "Set the title and time", "Share the link"] },
      { label: "Join cMeet", purpose: "Takes you into the room you pasted.", steps: ["Paste the link or code", "Choose Join cMeet", "Allow camera and microphone"] },
    ],
    questions: [
      "Do I need approval before starting a call?",
      "How do I invite someone outside CDS Space?",
      "What happens if I schedule instead of starting now?",
      "Can I add an agenda before the meeting?",
    ],
  },
  "client:book-session": {
    title: "Book a session",
    summary: "Request a one-to-one session with the team on a date and time window that suits you.",
    steps: ["Give your details and the duration", "Say what you want to discuss", "Pick a date and time window and submit"],
    sections: [
      { label: "Your details", purpose: "Name, email, phone and the session length." },
      { label: "Topic", purpose: "What you want to discuss. This one is required." },
      { label: "Preferred date and time", purpose: "A date, and morning, afternoon or evening." },
    ],
    actions: [
      { label: "Book session", purpose: "Submits the request. Confirmation comes by email.", steps: ["Complete the form", "Choose Book session", "Watch for the confirmation email"] },
    ],
    questions: [
      "When will my session time be confirmed?",
      "Can I pick an exact time instead of a window?",
      "Is there a charge for a session?",
      "How do I reschedule after submitting?",
    ],
  },
  "client:subscription": {
    title: "Subscription",
    summary: "Your plan, your design quota, and the design requests you have made.",
    steps: ["Check your plan and remaining quota", "Raise a new design request", "Pay any invoice for a plan change"],
    sections: [
      { label: "Active plan", purpose: "Your plan, industry, billing cycle, next billing date and design usage." },
      { label: "Plan catalogue", purpose: "Startup, Scaleup and Supreme with their design quantity and price." },
      { label: "Design requests", purpose: "Your requests as pending, in review, active or completed." },
    ],
    actions: [
      { label: "New design request", purpose: "Starts a design request. It is disabled once your quota is used.", steps: ["Choose New design request", "Describe what you need and attach references", "Submit"] },
      { label: "Pay with Paystack", purpose: "Pays for the selected plan by card.", steps: ["Pick the plan", "Choose Pay with Paystack", "Complete the checkout"] },
      { label: "Generate invoice", purpose: "Creates an invoice for the plan instead of paying by card.", steps: ["Pick the plan", "Choose Generate invoice", "Open and pay it"] },
      { label: "Download Files", purpose: "Downloads the finished work on a completed request.", steps: ["Open the completed request", "Choose Download Files", "Save them"] },
    ],
    questions: [
      "How many designs are left in my quota this month?",
      "Why is New design request greyed out?",
      "What happens to my plan while an upgrade invoice is unpaid?",
      "Can I pay by invoice instead of card?",
    ],
  },
  "client:settings": {
    title: "Account settings",
    summary: "Your profile, sign-in security, connected accounts, saved card and account closure.",
    steps: ["Update your profile and save", "Manage your password and connected accounts", "Add or update your payment card"],
    sections: [
      { label: "Profile details", purpose: "Name, company, phone and your read-only email." },
      { label: "Connected sign-in accounts", purpose: "Google and LinkedIn, and whether each is connected." },
      { label: "Password and security", purpose: "Change your password after confirming the current one." },
      { label: "Payment options", purpose: "Your saved card, with its brand, last four digits and expiry." },
      { label: "Close business account", purpose: "Closure, confirmed by a six-digit code sent to your email." },
    ],
    actions: [
      { label: "Save profile", purpose: "Saves your name, company and phone.", steps: ["Edit the fields", "Choose Save profile", "Wait for the confirmation"] },
      { label: "Add payment method", purpose: "Sets up a card through Paystack.", steps: ["Choose Add payment method", "Complete the hosted card setup", "Check the card is listed"] },
      { label: "Connect Google", purpose: "Links Google or LinkedIn to your account for sign-in.", steps: ["Choose Connect", "Sign in with that account", "Check it shows as connected"] },
    ],
    questions: [
      "Why can I not edit my email address?",
      "Will adding a card charge me anything?",
      "Can I change my billing currency?",
      "Can account closure be reversed?",
    ],
  },
  "client:banners": {
    title: "Banners",
    summary: "Your banner orders, and the three-step studio that creates them.",
    steps: ["Open the studio and set dimensions", "Add your artwork or ask us to design", "Choose fulfilment and submit"],
    sections: [
      { label: "Submitted orders", purpose: "Specifications, dimensions, quality grade, fulfilment and recipient." },
      { label: "Saved drafts", purpose: "Unfinished studio drafts, searchable by title or ID." },
      { label: "Banner Studio", purpose: "Step one dimensions, step two artwork, step three fulfilment." },
    ],
    actions: [
      { label: "Create banner", purpose: "Opens the banner studio.", steps: ["Choose Create banner", "Work through the three steps", "Submit"] },
      { label: "Continue draft", purpose: "Reopens a saved draft where you left it.", steps: ["Find the draft", "Choose Continue draft", "Finish and submit"] },
      { label: "Request an edit", purpose: "Asks for a change to a submitted order. At least ten characters.", steps: ["Open the order", "Choose Request an edit", "Describe the change"] },
    ],
    questions: [
      "What size should I choose for an outdoor banner?",
      "What is the difference between standard and premium?",
      "Can I still request an edit after production starts?",
      "Will my draft be kept if I exit part way?",
    ],
  },
  "client:merch": {
    title: "Merch studio",
    summary: "Branded merchandise orders, from product choice through to invoice or quotation.",
    steps: ["Pick the product, quantity and variant", "Upload your print or ask us to design", "Choose delivery and create the invoice"],
    sections: [
      { label: "Stat cards", purpose: "All orders, active, completed and saved drafts." },
      { label: "Stage filters", purpose: "Drafts, awaiting quote, awaiting payment, active and completed." },
      { label: "Order details", purpose: "Invoice and payment, production, then completed and delivered." },
      { label: "Studio steps", purpose: "Product and quantity, artwork, then delivery and offer code." },
    ],
    actions: [
      { label: "Create merch order", purpose: "Opens the merch studio.", steps: ["Choose Create merch order", "Work through the steps", "Create the invoice"] },
      { label: "Pay now", purpose: "Opens the invoice for an order awaiting payment.", steps: ["Find the order", "Choose Pay now", "Complete payment"] },
      { label: "Request quotation", purpose: "Submits a custom item for tailored pricing.", steps: ["Describe the custom item", "Choose Request quotation", "Wait for the quote"] },
    ],
    questions: [
      "When does my order move from awaiting payment to active?",
      "What file formats can I upload for printing?",
      "Is pickup available in my country?",
      "Who pays for delivery if billed separately?",
    ],
  },
  "client:cgifts": {
    title: "cGifts",
    summary: "Branded gifts, with an advisor that suggests products for your occasion and budget.",
    steps: ["Describe the occasion, recipients and budget", "Review the suggestions", "Customise the gift and order it"],
    sections: [
      { label: "Gift advisor", purpose: "Your occasion, how many recipients, and the budget." },
      { label: "Suggestions", purpose: "Up to three matched products with the reason for each." },
      { label: "Choose a gift", purpose: "The catalogue with a from price, or request a quote." },
    ],
    actions: [
      { label: "Ask advisor", purpose: "Returns matching products that are available.", steps: ["Describe the occasion and budget", "Choose Ask advisor", "Read the suggestions"] },
      { label: "Customize", purpose: "Opens that gift in the studio.", steps: ["Choose Customize", "Add your branding", "Order it"] },
    ],
    questions: [
      "Can the advisor stay within my per-gift budget?",
      "Are the suggested items actually in stock?",
      "How do gift orders differ from merch orders?",
      "Can I ship to several recipient addresses?",
    ],
  },
  "client:blog": {
    title: "CDS Space Intelligence",
    summary: "Research, audits and market insight, including assessments written for your brand.",
    steps: ["Filter to a category", "Open the article", "Look for a private assessment badge"],
    sections: [
      { label: "Category filter", purpose: "All, plus whichever categories the articles use." },
      { label: "Article grid", purpose: "Cover, type, title, excerpt, author, date and reading time." },
      { label: "Private assessment badge", purpose: "Marks an article written for a specific client." },
    ],
    actions: [
      { label: "Category chip", purpose: "Filters the grid to that category.", steps: ["Choose the category", "Read the filtered list", "Choose All to reset"] },
    ],
    questions: [
      "Is my private assessment visible to other clients?",
      "Where do I find the audit done for my brand?",
      "How often are new articles published?",
      "Can I filter by publication type too?",
    ],
  },
  "client:intelligence": {
    title: "CDS Space Intelligence",
    summary: "The same article library as the Blog menu item: research, audits and market insight.",
    steps: ["Filter to a category", "Open the article", "Look for your own brand's assessment"],
    sections: [
      { label: "Category filter", purpose: "Narrows the grid to one category." },
      { label: "Article grid", purpose: "Every article with its type, author and reading time." },
    ],
    actions: [
      { label: "Category chip", purpose: "Filters the articles.", steps: ["Choose a category", "Read the list", "Reset with All"] },
    ],
    questions: [
      "Is this the same library as Blog?",
      "Which articles were written for my company?",
      "Can I download an article as a PDF?",
      "Why do some cards have no cover image?",
    ],
  },
  "client:tutorials": {
    title: "Tutorials",
    summary: "Short videos on each CDS Space tool, with audio in more than one language.",
    steps: ["Search for the tool you need", "Play the tutorial", "Switch the audio language if you prefer"],
    sections: [
      { label: "Search", purpose: "Finds tutorials by title, description or tool." },
      { label: "Tutorial cards", purpose: "The tool, title, description and how many audio languages it has." },
      { label: "Watched badge", purpose: "Shows which tutorials you have finished." },
      { label: "Player", purpose: "Follows your language setting and lets you change the audio track." },
    ],
    actions: [
      { label: "Play", purpose: "Opens the player and remembers your progress.", steps: ["Choose the tutorial", "Watch it", "Close when done, your place is saved"] },
    ],
    questions: [
      "Is there a tutorial for cDrive or Merch?",
      "Can I switch the audio to another language?",
      "Does it resume where I stopped watching?",
      "Are captions available?",
    ],
  },
};


/** The admin portal: people, publishing and the remaining tools. */
const ADMIN_PEOPLE_GUIDES: Record<string, PageGuide> = {
  "admin:upload-works": {
    title: "Upload new work",
    summary: "Add a portfolio project with its description, images and cover.",
    steps: ["Fill in the title, description and scope", "Add at least one project image", "Continue, pick a category and cover, then upload"],
    sections: [
      { label: "Project details", purpose: "Title, description, industry and timeline." },
      { label: "Scope and deliverables", purpose: "One item per line in each box." },
      { label: "Project images", purpose: "The gallery. At least one image is required." },
      { label: "Finalize upload", purpose: "Pick the category and choose which image is the cover." },
    ],
    actions: [
      { label: "Continue", purpose: "Checks the title and images, then opens the finalize step.", steps: ["Complete the details", "Add an image", "Choose Continue"] },
      { label: "Upload Work", purpose: "Uploads the files and creates the work.", steps: ["Pick the category and cover", "Choose Upload Work", "Wait for it to finish"] },
    ],
    questions: [
      "Why does Continue say I need at least one image?",
      "Is a cover image required?",
      "What goes in scope rather than deliverables?",
      "Where does the category list come from?",
    ],
  },
  "admin:faqs": {
    title: "FAQs",
    summary: "The questions and answers shown on the landing page, in the order you set.",
    steps: ["Add the question and answer", "Reorder with the arrows", "Edit in place when the wording changes"],
    sections: [
      { label: "Add form", purpose: "The question and its answer." },
      { label: "All FAQs", purpose: "Every FAQ, in the order the public page shows them." },
      { label: "Reorder arrows", purpose: "Move an entry up or down." },
    ],
    actions: [
      { label: "Add FAQ", purpose: "Creates the FAQ.", steps: ["Write the question and answer", "Choose Add FAQ", "Check its position"] },
      { label: "Save", purpose: "Saves an edit made in place.", steps: ["Choose the edit icon", "Change the wording", "Choose Save"] },
    ],
    questions: [
      "Does the order here match the public page?",
      "Can I edit an answer without re-adding it?",
      "Is deleting a FAQ reversible?",
      "How long can an answer be?",
    ],
  },
  "admin:brand-briefs": {
    title: "Brand briefs",
    summary: "Shareable brief links clients fill in without an account, and what comes back.",
    steps: ["Request a new brief and share its link", "Watch for the submitted response", "Attach it to the right client account"],
    sections: [
      { label: "Stat cards", purpose: "Total briefs, awaiting response and submitted." },
      { label: "Status tabs", purpose: "All, pending, submitted and archived, with counts." },
      { label: "Table", purpose: "Label, brand, client, created date and status." },
      { label: "Attach to client", purpose: "Links a submitted brief to a client account, or detaches it." },
    ],
    actions: [
      { label: "Request New Brand Brief", purpose: "Creates a brief link with a label and internal note.", steps: ["Choose Request New Brand Brief", "Give it a label", "Copy and send the link"] },
      { label: "Generate Invoice", purpose: "Raises an invoice from the brief, or creates a project.", steps: ["Open the more actions menu", "Choose Generate Invoice", "Check the invoice"] },
      { label: "Copy link", purpose: "Copies the brief URL to send to the client.", steps: ["Find the brief", "Choose Copy link", "Send it"] },
    ],
    questions: [
      "Does the client need an account to fill this in?",
      "What happens when I generate an invoice from a brief?",
      "How do I re-link a brief to the right account?",
      "Does archiving break a link already sent?",
    ],
  },
  "admin:pricing": {
    title: "Plan pricing",
    summary: "Subscription prices, set per industry and per billing currency.",
    steps: ["Choose the industry, or turn on uniform pricing", "Set the price for each plan and currency", "Save"],
    sections: [
      { label: "Uniform pricing", purpose: "Writes each figure to every industry at once." },
      { label: "Industry tabs", purpose: "Which industry's prices you are editing." },
      { label: "Plan cards", purpose: "A price input per currency. NGN is the base, the others follow." },
      { label: "All industries in USD", purpose: "Every industry against every plan, with Not set where it is zero." },
    ],
    actions: [
      { label: "Save pricing", purpose: "Saves the prices. It stays greyed out until something changes.", steps: ["Edit the figures", "Choose Save pricing", "Check the table"] },
    ],
    questions: [
      "Why are non-NGN currencies labelled auto?",
      "If uniform pricing is on, do industry tabs still matter?",
      "Why is Save pricing greyed out?",
      "Is Supreme priced per design rather than monthly?",
    ],
  },
  "admin:intelligence": {
    title: "Intelligence",
    summary: "Publication counts, engagement and where each piece sits in the editorial workflow.",
    steps: ["Read the tiles", "Pick up anything sitting in review", "Start a new publication"],
    sections: [
      { label: "Stat tiles", purpose: "Published, private reports, total views and engagement." },
      { label: "Recently updated", purpose: "The last seven publications with their status." },
      { label: "Editorial workflow", purpose: "How many are draft, in review, approved or scheduled." },
    ],
    actions: [
      { label: "New publication", purpose: "Opens the create wizard.", steps: ["Choose New publication", "Work through the three steps", "Publish or save a draft"] },
    ],
    questions: [
      "What counts toward the engagement number?",
      "Why is a publication sitting in review?",
      "Are private reports included in total views?",
      "Which items appear under recently updated?",
    ],
  },
  "admin:intelligence/library": {
    title: "Publication library",
    summary: "Every live publication, searchable and filterable by type and status.",
    steps: ["Filter by type or status", "Open the publication to edit", "Preview the published page"],
    sections: [
      { label: "Type filter", purpose: "Reports, brand audits, benchmarks, executive briefs and case studies." },
      { label: "Table", purpose: "Publication and slug, type, status, access and performance." },
    ],
    actions: [
      { label: "Pencil icon", purpose: "Opens the publication in the editor.", steps: ["Find the row", "Choose the pencil", "Edit and save"] },
      { label: "Eye icon", purpose: "Opens the live page. Published items only.", steps: ["Find a published row", "Choose the eye", "Check how it reads"] },
      { label: "Trash icon", purpose: "Moves the publication to deleted after confirming.", steps: ["Choose the trash", "Confirm", "Find it under archive"] },
    ],
    questions: [
      "Why can I not preview a draft?",
      "Does deleting remove it permanently?",
      "What does an access of private client mean?",
      "Which types count as executive briefs?",
    ],
  },
  "admin:intelligence/create": {
    title: "Create publication",
    summary: "A three-step wizard: details, the PDF and who can read it, then review and publish.",
    steps: ["Set the type, title and summary", "Upload the PDF and set access", "Review, then publish or schedule"],
    sections: [
      { label: "Type and details", purpose: "Publication type, title, summary, author, category or original source." },
      { label: "PDF and access", purpose: "The PDF up to 75MB, reader permission, cover image, access level and assigned client." },
      { label: "Review and publish", purpose: "A live preview, plus featured, comments, reactions, sharing and SEO title." },
      { label: "Ready to publish", purpose: "A checklist of title, summary, PDF, cover and source." },
    ],
    actions: [
      { label: "Publish now", purpose: "Saves and publishes. With a new PDF it stages as a draft first.", steps: ["Clear the checklist", "Choose Publish now", "Check the live page"] },
      { label: "Save draft", purpose: "Saves at any step without publishing.", steps: ["Choose Save draft", "Come back later", "Finish the steps"] },
    ],
    questions: [
      "Why was my publication saved as a draft?",
      "What happens if I skip the cover image?",
      "When do I need the original post URL?",
      "Does view only stop readers downloading the PDF?",
    ],
  },
  "admin:intelligence/private": {
    title: "Private reports",
    summary: "Only the publications written for a single client.",
    steps: ["Find the report", "Open it to change the assigned client", "Check who can reach it"],
    sections: [
      { label: "Table", purpose: "Publication, type, status, access and performance, filtered to private reports." },
    ],
    actions: [
      { label: "Pencil icon", purpose: "Opens the report to edit, including its assigned client.", steps: ["Choose the pencil", "Change the assignment", "Save"] },
    ],
    questions: [
      "How do I change which client a report is assigned to?",
      "Why is a client-only report missing from this list?",
      "Can a private report still collect views?",
      "Does an access expiry show here?",
    ],
  },
  "admin:intelligence/comments": {
    title: "Comment moderation",
    summary: "Reader comments on publications, with reports flagged.",
    steps: ["Filter by status", "Read the comment and any reports", "Approve, hide or delete it"],
    sections: [
      { label: "Comment cards", purpose: "Reader name and email, the publication, the time, status and the comment." },
      { label: "Reports badge", purpose: "Shows in red when readers have reported a comment." },
    ],
    actions: [
      { label: "Approve", purpose: "Approves the comment so it shows publicly.", steps: ["Read it", "Choose Approve", "Check it appears"] },
      { label: "Hide", purpose: "Hides an approved comment, and Restore brings it back.", steps: ["Choose Hide", "The comment is withdrawn", "Restore if reconsidered"] },
    ],
    questions: [
      "Are new comments pending by default?",
      "What does the reports count mean?",
      "Can a deleted comment be brought back?",
      "How do I see all comments on one publication?",
    ],
  },
  "admin:intelligence/analytics": {
    title: "Intelligence analytics",
    summary: "Readership and engagement over a chosen window.",
    steps: ["Pick the range", "Read the tiles and daily chart", "Look at the top publications"],
    sections: [
      { label: "Stat tiles", purpose: "Views, unique readers, PDF opens, downloads, shares, clicks, average time and scroll." },
      { label: "Daily readership", purpose: "Views per day as a bar chart." },
      { label: "Top publications", purpose: "The seven most read, with unique readers." },
    ],
    actions: [
      { label: "Range select", purpose: "Reloads every metric for 7, 30, 90 days or a year.", steps: ["Pick the range", "Read the tiles", "Compare with the previous range"] },
    ],
    questions: [
      "What is the difference between views and unique readers?",
      "Does a PDF open count as a download?",
      "Is average scroll measured on the page or the PDF?",
      "Do private reports appear in top publications?",
    ],
  },
  "admin:intelligence/authors": {
    title: "Authors and contributors",
    summary: "The people credited on publications: CDS authors and external originators.",
    steps: ["Add the author with their type", "Fill in the role and bio", "Use them for attribution"],
    sections: [
      { label: "Author cards", purpose: "Photo, name, an originator badge for external people, role and bio." },
      { label: "Author form", purpose: "Type, name, role, organisation and profile URL for external, and a short bio." },
    ],
    actions: [
      { label: "CDS author", purpose: "Adds an internal author, or Report originator for an external one.", steps: ["Choose the type", "Fill in the details", "Choose Save author"] },
      { label: "Trash icon", purpose: "Deactivates the author. Existing attribution is kept.", steps: ["Choose the trash", "Confirm", "Past credits remain"] },
    ],
    questions: [
      "What is the difference between a CDS author and an originator?",
      "Does deactivating remove them from published reports?",
      "Why does an external author need a profile URL?",
      "Where is the expertise list used?",
    ],
  },
  "admin:intelligence/taxonomy": {
    title: "Taxonomy",
    summary: "The categories, tags and series the public library is organised by.",
    steps: ["Pick the kind", "Add the item with its name", "Check the slug it generated"],
    sections: [
      { label: "Kind switcher", purpose: "Category, tag or series." },
      { label: "List", purpose: "Each item with its slug, and a marker when inactive." },
    ],
    actions: [
      { label: "Add category", purpose: "Creates an item of the selected kind.", steps: ["Pick the kind", "Enter the name", "Choose Add"] },
    ],
    questions: [
      "Why do tags have no description?",
      "What does the inactive marker mean?",
      "Is the slug generated automatically?",
      "What happens to publications using a category I delete?",
    ],
  },
  "admin:intelligence/archive": {
    title: "Publication archive",
    summary: "Archived and deleted publications.",
    steps: ["Find the publication", "Open it in the editor", "Change its status to bring it back"],
    sections: [
      { label: "Table", purpose: "Publication, type, status, access and performance, filtered to archived and deleted." },
    ],
    actions: [
      { label: "Pencil icon", purpose: "Opens an archived publication in the editor.", steps: ["Choose the pencil", "Change the status", "Save"] },
    ],
    questions: [
      "Is there a restore button, or do I change status in the editor?",
      "What is the difference between archived and deleted?",
      "Can readers still reach an archived URL?",
      "Are archived views still counted?",
    ],
  },
  "admin:intelligence/settings": {
    title: "Intelligence settings",
    summary: "The setting groups behind the Intelligence library.",
    steps: ["Find the group", "Change the toggle or value", "Save settings"],
    sections: [
      { label: "Setting groups", purpose: "One card per setting key." },
      { label: "Controls", purpose: "Toggles for yes or no settings, inputs for everything else." },
    ],
    actions: [
      { label: "Save settings", purpose: "Saves every setting group.", steps: ["Make the changes", "Choose Save settings", "Wait for the confirmation"] },
    ],
    questions: [
      "Which group controls comment defaults?",
      "Do these apply to already-published reports?",
      "Are changes live immediately?",
      "Where are the defaults defined?",
    ],
  },
  "admin:ai-system": {
    title: "AI system",
    summary: "AI access, usage, the knowledge library and prompt templates.",
    steps: ["Set who may use AI and the token cap", "Add knowledge documents", "Build the prompt templates"],
    sections: [
      { label: "Stat tiles", purpose: "Calls in the last seven days, knowledge documents and templates." },
      { label: "AI settings", purpose: "AI on or off, team access, public access, the default model and daily token cap." },
      { label: "Usage snapshot", purpose: "Recent calls with kind, status, who made them and tokens used." },
      { label: "Knowledge library", purpose: "Uploaded documents with their title, category, tags and notes." },
      { label: "Template builder", purpose: "Title, category, description, body template, seed prompt and variables." },
    ],
    actions: [
      { label: "Save settings", purpose: "Saves the flags, model and token cap.", steps: ["Change the settings", "Choose Save settings", "Check the snapshot"] },
      { label: "Add to knowledge base", purpose: "Uploads a document the AI can draw on.", steps: ["Pick the file and category", "Choose Add to knowledge base", "Check it is listed"] },
      { label: "Create template", purpose: "Saves a prompt scaffold for reuse.", steps: ["Write the body and seed prompt", "Choose Create template", "Test it"] },
    ],
    questions: [
      "Does turning off public access also block the team?",
      "Which file types extract text best?",
      "What format does the variables field expect?",
      "Is the daily token cap per person or overall?",
    ],
  },
  "admin:cmeet-api": {
    title: "cMeet API access",
    summary: "Approve API applications, issue scoped keys and revoke them. Super admin only.",
    steps: ["Read the application and its expected volume", "Approve and issue the key", "Copy the secret once and send it securely"],
    sections: [
      { label: "Applications", purpose: "Applicant, status, email, use case and expected monthly calls." },
      { label: "Issued keys", purpose: "Name, applicant, prefix, rate limit and last used." },
      { label: "Issued key dialog", purpose: "Shows the secret once. It is never stored." },
    ],
    actions: [
      { label: "Approve and issue", purpose: "Creates a key with meeting scopes and a rate limit, then shows the secret.", steps: ["Check the use case", "Choose Approve and issue", "Copy the secret before closing"] },
      { label: "Revoke", purpose: "Revokes an active key.", steps: ["Find the key", "Choose Revoke", "Tell the holder"] },
    ],
    questions: [
      "What scopes and rate limit does a key get?",
      "Can I recover a secret after closing the dialog?",
      "What happens to calls in flight when I revoke?",
      "Why does a key show never under last used?",
    ],
    tips: ["The secret is shown once and never stored. If it is lost, issue a new key."],
  },
  "admin:cresume": {
    title: "cResume",
    summary: "The public one-page resume link for each team member.",
    steps: ["Find the member", "Open or copy their public link", "Share it where needed"],
    sections: [
      { label: "Member list", purpose: "Name, username, role title and department." },
    ],
    actions: [
      { label: "Open public resume", purpose: "Opens their public page in a new tab.", steps: ["Find the member", "Choose Open public resume", "Check how it reads"] },
      { label: "Link icon", purpose: "Copies the public resume URL.", steps: ["Choose the link icon", "Paste it where needed", "Check it opens"] },
    ],
    questions: [
      "Does every member get a public resume automatically?",
      "Is a deactivated member's resume still reachable?",
      "Where does the resume content come from?",
      "Why is a teammate missing from this list?",
    ],
  },
  "admin:team-members": {
    title: "Team members",
    summary: "Create team accounts, send self-serve invites, and manage status and face verification.",
    steps: ["Generate an invite link or add the member yourself", "Set their role and department", "Manage status from the detail drawer"],
    sections: [
      { label: "Self-serve invite links", purpose: "Pending invites, valid for 14 days, that the person completes themselves." },
      { label: "All members", purpose: "Everyone, searchable, with online, offline or break presence." },
      { label: "Member detail", purpose: "Profile, permissions and face verification with match score and last verified." },
    ],
    actions: [
      { label: "Generate invite link", purpose: "Creates a link the teammate fills in themselves.", steps: ["Choose Generate invite link", "Send it", "They complete their details"] },
      { label: "Add team member", purpose: "Creates the account yourself.", steps: ["Choose Add team member", "Fill in name, email, username and role", "Save"] },
      { label: "Suspend account", purpose: "Locks the account without removing it.", steps: ["Open the member", "Choose Suspend account", "Unsuspend to restore"] },
      { label: "Reset capture", purpose: "Clears their face enrollment so they can set it up again.", steps: ["Open the member", "Choose Reset capture", "They re-enroll at next login"] },
    ],
    questions: [
      "How long is a self-serve invite valid?",
      "What does the teammate fill in versus what I set?",
      "When should I use reset capture?",
      "Does suspending differ from removing?",
    ],
  },
  "admin:work-tracking": {
    title: "Work activity",
    summary: "Team focus, attendance and evidence for one day and department.",
    steps: ["Pick the date and department", "Open a member to see their activity", "Generate the daily or weekly report"],
    sections: [
      { label: "Metrics", purpose: "People in view, live focus, active context and evidence updates." },
      { label: "Team focus", purpose: "A card per member, clickable for their activity." },
      { label: "Member activity", purpose: "Attendance, check in, active context, evidence, timeline and reports." },
      { label: "Past seven days", purpose: "Attendance, context, evidence and summary by date." },
    ],
    actions: [
      { label: "Update daily summary", purpose: "Generates the daily report for that member.", steps: ["Open the member", "Choose Update daily summary", "Read the result"] },
      { label: "Compare", purpose: "Compares the weekly report against the evidence.", steps: ["Choose Weekly first", "Choose Compare", "Read the differences"] },
    ],
    questions: [
      "What counts as an evidence update?",
      "What does member confirmed mean on the timeline?",
      "How is active context measured against clock-in time?",
      "What does Compare check against?",
    ],
  },
  "admin:team-reports": {
    title: "Team reports",
    summary: "What each member reported, against the attendance and task evidence for that day.",
    steps: ["Pick the date", "Generate the day or weekly report", "Run the comparison"],
    sections: [
      { label: "Stat tiles", purpose: "Team size, active focus, manual and system reports, weekly self-reports and comparisons run." },
      { label: "Table", purpose: "Member, attendance, activity, weekly report, system report and comparison." },
      { label: "Expanded row", purpose: "The comparison detail, including additional detected work." },
    ],
    actions: [
      { label: "Generate day report", purpose: "Builds the daily report for that member.", steps: ["Find the member", "Choose Generate day report", "Read it"] },
      { label: "Compare report vs evidence", purpose: "Compares what they said against what was recorded.", steps: ["Generate the weekly rollup first", "Choose Compare", "Expand the row"] },
    ],
    questions: [
      "Why is a member missing from the table?",
      "What is the difference between manual and system reports?",
      "Why can I not run a comparison yet?",
      "What is additional detected work?",
    ],
  },
  "admin:sub-admins": {
    title: "Sub-admins",
    summary: "Sub-admin accounts, reusable permission roles, and who can reach what.",
    steps: ["Create the role bundle", "Add the sub-admin with that role", "Send them the login invite link"],
    sections: [
      { label: "Roles", purpose: "Reusable permission bundles with their descriptions and counts." },
      { label: "Sub-admin list", purpose: "Each account with its permissions, and a disabled badge where relevant." },
      { label: "Team admins", purpose: "Team members who hold admin permissions." },
    ],
    actions: [
      { label: "Create Role", purpose: "Bundles permissions for reuse.", steps: ["Choose Create Role", "Tick the permissions", "Save"] },
      { label: "Add Sub-Admin", purpose: "Creates the account with its permissions.", steps: ["Choose Add Sub-Admin", "Enter name, email and permissions", "Create"] },
      { label: "Send login invite link", purpose: "Generates the one-time link that prefills their login.", steps: ["Open the sub-admin", "Choose Send login invite link", "Send it securely"] },
      { label: "Disable access", purpose: "Deactivates the account while keeping its permissions.", steps: ["Flip the toggle", "The account is locked", "Enable to restore"] },
    ],
    questions: [
      "Is the invite link single use?",
      "What is the difference between a role and manual permissions?",
      "Does disabling keep their permissions for later?",
      "How do team members end up as team admins?",
    ],
  },
  "admin:screening": {
    title: "Applicant screening",
    summary: "Schedule screenings, set question banks, and rate the practical and interview stages.",
    steps: ["Set the appointment for the role", "Review the objective test", "Rate the practical and interview, then decide"],
    sections: [
      { label: "Role scheduling", purpose: "Screening appointment and interview details, applied to the whole role." },
      { label: "Candidate detail", purpose: "The appointment, objective test status, score, warnings and answers." },
      { label: "Ratings", purpose: "A score out of 100 for practical and interview, with feedback for the candidate." },
      { label: "Question bank", purpose: "The role's questions and who is allowed to set them." },
    ],
    actions: [
      { label: "Save appointment for all", purpose: "Saves the screening time for everyone in the role.", steps: ["Set date, location and what to bring", "Choose Save appointment for all", "Candidates are told"] },
      { label: "Save rating", purpose: "Stores the score and the feedback.", steps: ["Enter the score", "Write the feedback", "Choose Save rating"] },
      { label: "passed", purpose: "Records the decision. Passed marks the application hired, failed rejects it.", steps: ["Review both ratings", "Choose passed or failed", "The application updates"] },
    ],
    questions: [
      "Can I set a different time for one candidate?",
      "Why is the objective test locked for this candidate?",
      "Does my feedback get shown to the candidate?",
      "What can an assigned question setter do?",
    ],
  },
  "admin:team-payroll": {
    title: "Team payroll",
    summary: "Payroll entries, approvals and the team's bank details.",
    steps: ["Create the entry for the member or department", "Approve it", "Mark it paid once money has gone"],
    sections: [
      { label: "Stat cards", purpose: "Entries, team members, outstanding and paid." },
      { label: "Team bank details", purpose: "Each member's bank, account and base salary." },
      { label: "Entries table", purpose: "Member, period, net with gross and deductions, bank and status." },
      { label: "Bank change requests", purpose: "Pending changes members have submitted." },
    ],
    actions: [
      { label: "New Payroll", purpose: "Creates an entry for a member or a whole department.", steps: ["Choose New Payroll", "Set the period, gross and deductions", "Save"] },
      { label: "Approve", purpose: "Approves a pending entry, before it can be paid.", steps: ["Check the figures", "Choose Approve", "Then Mark Paid"] },
      { label: "Bank Requests", purpose: "Opens the pending bank detail changes.", steps: ["Choose Bank Requests", "Verify the change with the member", "Accept it"] },
    ],
    questions: [
      "Can I create one entry for a whole department?",
      "Does approve have to happen before mark paid?",
      "Where do bank change requests come from?",
      "What is the difference between paid on and scheduled for?",
    ],
  },
  "admin:projects": {
    title: "Projects",
    summary: "Project and sub-contractor counts, and the way into the finance modules that hold them.",
    steps: ["Read the counts", "Open projects or sub-contractors", "Work from the finance screens"],
    sections: [
      { label: "Stat cards", purpose: "Total projects, active, and sub-contractors." },
      { label: "Quick access", purpose: "Projects and sub-contractors." },
      { label: "Recent projects", purpose: "The last five with client and status." },
    ],
    actions: [
      { label: "Projects card", purpose: "Opens the finance projects list.", steps: ["Choose the card", "Work the list", "Open a project"] },
    ],
    questions: [
      "Why do these counts differ from the finance projects page?",
      "Are paused and completed projects included?",
      "Where do I actually create a project?",
      "Why does a project show a reference instead of a client?",
    ],
    tips: ["The projects, contractors and subscriptions links redirect into the finance section."],
  },
  "admin:vendors": {
    title: "Vendors",
    summary: "Sub-contractors, vendors, suppliers and partners, with their agreement status.",
    steps: ["Filter by type", "Add or edit the vendor", "Keep the agreement status current"],
    sections: [
      { label: "Table", purpose: "Vendor, type, contact and agreement." },
      { label: "Agreement badges", purpose: "Active, pending, expired, or no agreement." },
      { label: "Vendor form", purpose: "Name, type, agreement, niche, phone, WhatsApp, email, location and notes." },
    ],
    actions: [
      { label: "Add vendor", purpose: "Creates a vendor record.", steps: ["Choose Add vendor", "Fill in the details", "Save"] },
    ],
    questions: [
      "What separates a sub-contractor from a vendor?",
      "Does an expired agreement block anything?",
      "Which contact is used for outreach?",
      "Are vendor notes visible outside admin?",
    ],
  },
  "admin:testimonials": {
    title: "Testimonials",
    summary: "Client testimonials and their photos, as shown on the public site.",
    steps: ["Add the photo, name and review", "Edit in place when needed", "Delete what is out of date"],
    sections: [
      { label: "Add new testimonial", purpose: "A square client photo, the name and the review." },
      { label: "List", purpose: "Every testimonial, with inline editing." },
    ],
    actions: [
      { label: "Add Testimonial", purpose: "Creates the testimonial.", steps: ["Add the photo and review", "Choose Add Testimonial", "Check the list"] },
      { label: "Save", purpose: "Saves an inline edit.", steps: ["Choose the edit icon", "Change the wording or photo", "Choose Save"] },
    ],
    questions: [
      "Does the photo have to be square?",
      "Is a photo required?",
      "Where do these appear on the public site?",
      "Can I reorder testimonials?",
    ],
  },
};

const PAGE_GUIDES: Record<string, PageGuide> = {
  ...GENERIC_GUIDES,
  ...TEAM_GUIDES,
  ...ADMIN_MONEY_GUIDES,
  ...ADMIN_OPS_GUIDES,
  ...ADMIN_PEOPLE_GUIDES,
  ...CLIENT_GUIDES,
};

function humanise(value: string) {
  return decodeURIComponent(value)
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function dashboardRoute(pathname: string): { portal: Portal; keys: string[] } | null {
  const parts = pathname.split("/").filter(Boolean);
  // Sub-pages are tried first, then their parent, so a screen without its own
  // entry still gets the closest written guidance rather than the generic one.
  const scoped = (portal: Portal, segments: string[]): { portal: Portal; keys: string[] } => {
    const clean = segments.filter((part) => part && !/^[0-9a-f]{8}-/i.test(part));
    const keys = clean.length > 1 ? [clean.slice(0, 2).join("/"), clean[0]] : [clean[0] || "dashboard"];
    return { portal, keys };
  };
  if (pathname === "/create" || pathname.startsWith("/create/")) return { portal: "create", keys: ["create"] };
  if (parts[0] === "admin" && parts[1] !== "login") return scoped("admin", parts.slice(1));
  if (parts[0] === "team" && !["login", "invite"].includes(parts[1] || "")) return scoped("team", parts.slice(1));
  if (parts[0] === "marketer" && !["login", "agreement", "onboarding"].includes(parts[1] || "")) return scoped("marketer", parts.slice(1));
  const dashboardIndex = parts.indexOf("dashboard");
  if (dashboardIndex >= 0) return scoped("client", parts.slice(dashboardIndex + 1));
  return null;
}

function getGuideContext(pathname: string): GuideContext | null {
  const route = dashboardRoute(pathname);
  if (!route) return null;
  // Portal-scoped first: "settings" means something different to a team
  // member and to a client, and each deserves its own guidance.
  const candidates = [
    ...route.keys.map((key) => `${route.portal}:${key}`),
    ...route.keys,
  ];
  const matchedKey = candidates.find((key) => PAGE_GUIDES[key]) || route.keys[0];
  const known = PAGE_GUIDES[matchedKey];
  const plainKey = matchedKey.includes(":") ? matchedKey.split(":")[1] : matchedKey;
  const fallbackTitle = plainKey === "dashboard" ? "Dashboard overview" : humanise(plainKey.split("/").pop() || plainKey);
  return {
    portal: route.portal,
    portalLabel: PORTAL_NAMES[route.portal],
    title: known?.title || fallbackTitle,
    summary: known?.summary || `Use this ${fallbackTitle.toLowerCase()} screen to review information and complete the actions available to your role.`,
    steps: known?.steps || ["Review the page summary and available filters", "Open the record you want to work with", "Use the primary action and check for confirmation"],
    sections: known?.sections || [{ label: fallbackTitle, purpose: known?.summary || `Review and complete the available ${fallbackTitle.toLowerCase()} workflows.` }],
    actions: known?.actions || [],
    questions: known?.questions || [],
    tips: known?.tips || [],
    detailed: Boolean(known),
  };
}

const ACTION_PATTERNS: Array<{ match: RegExp; purpose: string; steps: string[] }> = [
  { match: /^(add|new|create)\b/i, purpose: "Starts a new record or workflow on this page.", steps: ["Choose the action", "Complete the required fields", "Review and save or submit the new record"] },
  { match: /^(save|update|apply)\b/i, purpose: "Saves the changes made in the current section.", steps: ["Review the edited fields", "Choose the action", "Wait for the saved confirmation before leaving"] },
  { match: /^(upload|attach)\b/i, purpose: "Adds an approved file to the current workflow.", steps: ["Choose the action", "Select the correct file", "Wait for upload confirmation and review the file name"] },
  { match: /^(download|export)\b/i, purpose: "Creates a downloadable copy of the selected information.", steps: ["Set the required filters or date range", "Review the scope", "Choose the action and save the file"] },
  { match: /^(share|send|notify)\b/i, purpose: "Sends or shares the current item with the selected recipients.", steps: ["Open the correct item", "Choose the action and recipients", "Review the destination and confirm"] },
  { match: /^(approve|reject|review)\b/i, purpose: "Records a review decision for the selected item.", steps: ["Open and verify the record", "Choose the appropriate decision", "Confirm the result"] },
  { match: /^(search|filter|sort)\b/i, purpose: "Narrows or reorganises the records shown on this page.", steps: ["Choose the action", "Enter or select the criteria", "Review the updated results"] },
  { match: /^(join|start|audio|video)\b/i, purpose: "Starts or joins the selected communication workflow.", steps: ["Choose the action", "Review the room or call details", "Confirm and continue"] },
  { match: /^(generate|issue)\b/i, purpose: "Creates a new controlled resource from the information supplied.", steps: ["Complete the required options", "Choose the action", "Review and securely use the generated result"] },
];

function discoverPageActions() {
  if (typeof document === "undefined") return [] as GuideAction[];
  const nodes = Array.from(document.querySelectorAll<HTMLElement>("main button, main a[href], [role='main'] button, [role='main'] a[href]"));
  const seen = new Set<string>();
  const actions: GuideAction[] = [];
  for (const node of nodes) {
    if (node.closest("[data-dashboard-guide]") || node.getAttribute("aria-hidden") === "true") continue;
    const bounds = node.getBoundingClientRect();
    if (!bounds.width || !bounds.height) continue;
    const label = (node.getAttribute("aria-label") || node.getAttribute("title") || node.textContent || "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 64);
    if (!label || seen.has(label.toLowerCase()) || /^(close|menu|back|next|previous|\d+)$/i.test(label)) continue;
    const template = ACTION_PATTERNS.find((entry) => entry.match.test(label));
    if (!template) continue;
    seen.add(label.toLowerCase());
    actions.push({ label, purpose: template.purpose, steps: template.steps });
    if (actions.length >= 8) break;
  }
  return actions;
}

function quickQuestions(context: GuideContext) {
  // Written questions first: they name the real work of the screen, where a
  // generated one can only name whatever button happens to be on it.
  const questions = [...context.questions];
  if (questions.length < 4 && context.actions[0]) questions.push(`What does ${context.actions[0].label} do?`);
  if (questions.length < 4 && context.sections[0]) questions.push(`Explain the ${context.sections[0].label} section.`);
  if (questions.length < 4) questions.push("What can I do on this page?");
  if (questions.length < 4) questions.push("What should I do first on this page?");
  return questions.slice(0, 4);
}

/** Words that carry meaning when matching a question to a section or action. */
function keywords(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((word) => word.length > 3 && !["this", "that", "what", "where", "which", "does", "with", "from", "page", "here", "screen", "section", "about", "they", "them", "into", "have", "help"].includes(word));
}

function bestMatch<T extends { label: string }>(question: string, items: T[]): T | null {
  const asked = keywords(question);
  if (!asked.length) return null;
  let best: { item: T; score: number } | null = null;
  for (const item of items) {
    const words = keywords(item.label);
    const score = words.filter((word) => asked.some((term) => term.startsWith(word) || word.startsWith(term))).length;
    if (score > 0 && (!best || score > best.score)) best = { item, score };
  }
  return best?.item || null;
}

function describeEverything(context: GuideContext) {
  const parts = [context.summary];
  if (context.sections.length) {
    parts.push(`What is on this screen:\n${context.sections.map((item) => `\u2022 ${item.label}: ${item.purpose}`).join("\n")}`);
  }
  if (context.actions.length) {
    parts.push(`What you can do:\n${context.actions.map((item) => `\u2022 ${item.label}: ${item.purpose}`).join("\n")}`);
  }
  if (context.tips.length) parts.push(`Worth knowing:\n${context.tips.map((tip) => `\u2022 ${tip}`).join("\n")}`);
  return parts.join("\n\n");
}

function answerLocally(question: string, context: GuideContext) {
  const normal = question.toLowerCase();

  // "What can I do here" deserves the whole screen, not one sentence.
  if (/(what|which).*(can|could).*(do|use)|everything|all.*(action|option)|walk me through|overview of this/.test(normal)) {
    return describeEverything(context);
  }

  const action = context.actions.find((item) => normal.includes(item.label.toLowerCase()))
    || bestMatch(question, context.actions);
  if (action) {
    const steps = action.steps.map((step, index) => `${index + 1}. ${step}`).join("\n");
    return `${action.label}: ${action.purpose}${steps ? `\n\nSteps:\n${steps}` : ""}`;
  }
  const section = context.sections.find((item) => normal.includes(item.label.toLowerCase()))
    || bestMatch(question, context.sections);
  if (section) {
    const related = context.actions
      .filter((item) => keywords(item.label).some((word) => keywords(section.label).includes(word)))
      .slice(0, 3);
    return `${section.label}: ${section.purpose}${related.length ? `\n\nRelated actions: ${related.map((item) => item.label).join(", ")}.` : ""}`;
  }
  if (/private|privacy|openai|data|secure/.test(normal)) {
    return "This guide does not read your page content, files, form values, messages or account records, and it does not send them to OpenAI. It uses only the current route and a built-in help catalogue. Typed questions stay in this browser session.";
  }
  if (/save|draft|lost|refresh/.test(normal)) {
    return "Use the page’s Save or primary completion action when one is shown, and wait for its saved confirmation before leaving. Pages with autosave show a quiet saving, saved or error state. File inputs are uploaded securely rather than stored in your browser.";
  }
  if (/upload|file|document|receipt/.test(normal)) {
    return "Choose the page’s upload action, select the correct file, then wait for the upload confirmation. Review the file name and access before continuing; never place passwords or authentication secrets in a general attachment field.";
  }
  if (/share|send|link/.test(normal)) {
    return "Open the resource first, check that it is the correct item, then use its Share action. Private records should be shared only with the approved in-app recipients shown by the workspace.";
  }
  if (/delete|remove|archive/.test(normal)) {
    return "Open the exact record, verify its name and owner, then choose Archive or Delete. Read the confirmation carefully because some records must be retained and may only be archived.";
  }
  if (/error|failed|problem|not working/.test(normal)) {
    return "Keep the page open and read the inline error first. Retry once if it is a temporary network issue. If it continues, note the screen name and action you attempted, then contact support without including passwords, payment details or private document contents.";
  }
  if (/start|first|begin/.test(normal)) {
    return `Start with this: ${context.steps[0]}. Then ${context.steps[1].toLowerCase()}.`;
  }
  if (/what|do here|help|guide/.test(normal)) {
    return `${context.summary}\n\nRecommended order:\n1. ${context.steps[0]}\n2. ${context.steps[1]}\n3. ${context.steps[2]}`;
  }
  if (context.detailed) {
    return `${describeEverything(context)}\n\nAsk about any of these by name for the steps.`;
  }
  return `On ${context.title}, I recommend: ${context.steps[0]}, then ${context.steps[1].toLowerCase()}. I only provide page guidance, so I cannot see or change your private records.`;
}

function clampPosition(x: number, y: number) {
  return {
    x: Math.min(Math.max(x, EDGE), Math.max(EDGE, window.innerWidth - FAB_SIZE - EDGE)),
    y: Math.min(Math.max(y, EDGE), Math.max(EDGE, window.innerHeight - FAB_SIZE - EDGE)),
  };
}

export function DashboardGuide() {
  const pathname = usePathname();
  const isChatPage =
    pathname === "/team/chat" ||
    pathname === "/admin/chat" ||
    pathname === "/admin/messages" ||
    pathname === "/dashboard/messages" ||
    pathname.endsWith("/dashboard/messages");
  const context = useMemo(() => getGuideContext(pathname), [pathname]);
  if (!context || isChatPage) return null;
  return <DashboardGuideContent context={context} />;
}

function DashboardGuideContent({ context }: { context: GuideContext }) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [listening, setListening] = useState(false);
  const [speechNotice, setSpeechNotice] = useState("");
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null);
  const [messages, setMessages] = useState<GuideMessage[]>([]);
  const [discoveredActions, setDiscoveredActions] = useState<GuideAction[]>([]);
  const nextId = useRef(1);
  const panelRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const dragRef = useRef<{ startX: number; startY: number; offsetX: number; offsetY: number; moved: boolean } | null>(null);
  const effectiveContext = useMemo<GuideContext>(() => {
    const known = new Set(context.actions.map((action) => action.label.toLowerCase()));
    return {
      ...context,
      actions: [...context.actions, ...discoveredActions.filter((action) => !known.has(action.label.toLowerCase()))],
    };
  }, [context, discoveredActions]);
  const questions = useMemo(() => quickQuestions(effectiveContext), [effectiveContext]);

  useEffect(() => {
    const defaultPosition = clampPosition(window.innerWidth - FAB_SIZE - 20, window.innerHeight - FAB_SIZE - 92);
    try {
      const saved = JSON.parse(localStorage.getItem(POSITION_KEY) || "null") as { fx?: number; fy?: number } | null;
      if (saved && Number.isFinite(saved.fx) && Number.isFinite(saved.fy)) {
        setPosition(clampPosition((saved.fx || 0) * window.innerWidth, (saved.fy || 0) * window.innerHeight));
      } else setPosition(defaultPosition);
    } catch {
      setPosition(defaultPosition);
    }
    const resize = () => setPosition((current) => current ? clampPosition(current.x, current.y) : defaultPosition);
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);

  useEffect(() => {
    setMessages([{
      id: nextId.current++,
      role: "guide",
      text: context.detailed
        ? `${context.summary}\n\n${context.sections.map((item) => `\u2022 ${item.label}: ${item.purpose}`).join("\n")}\n\nAsk about any part of this screen, or pick a question below.`
        : `${context.summary} Ask me how to use this screen.`,
    }]);
    setInput("");
    setSpeechNotice("");
  }, [context]);

  useEffect(() => {
    const refresh = () => setDiscoveredActions(discoverPageActions());
    const timer = window.setTimeout(refresh, 250);
    return () => window.clearTimeout(timer);
  }, [context]);

  useEffect(() => {
    if (open) setDiscoveredActions(discoverPageActions());
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [open]);

  useEffect(() => () => recognitionRef.current?.stop(), []);

  const savePosition = (next: { x: number; y: number }) => {
    try {
      localStorage.setItem(POSITION_KEY, JSON.stringify({ fx: next.x / window.innerWidth, fy: next.y / window.innerHeight }));
    } catch { /* Position is optional. Questions are never persisted. */ }
  };

  const onPointerDown = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    dragRef.current = { startX: event.clientX, startY: event.clientY, offsetX: event.clientX - bounds.left, offsetY: event.clientY - bounds.top, moved: false };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    if (Math.abs(event.clientX - drag.startX) + Math.abs(event.clientY - drag.startY) > 5) drag.moved = true;
    if (drag.moved) setPosition(clampPosition(event.clientX - drag.offsetX, event.clientY - drag.offsetY));
  };

  const onPointerUp = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current;
    dragRef.current = null;
    if (!drag) return;
    if (!drag.moved) {
      setOpen((current) => !current);
      return;
    }
    const next = clampPosition(event.clientX - drag.offsetX, event.clientY - drag.offsetY);
    setPosition(next);
    savePosition(next);
  };

  const ask = (question: string) => {
    const clean = question.trim().slice(0, 500);
    if (!clean) return;
    setMessages((current) => [
      ...current,
      { id: nextId.current++, role: "user", text: clean },
      { id: nextId.current++, role: "guide", text: answerLocally(clean, effectiveContext) },
    ]);
    setInput("");
    requestAnimationFrame(() => {
      if (panelRef.current) panelRef.current.scrollTop = panelRef.current.scrollHeight;
    });
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    ask(input);
  };

  const toggleSpeech = () => {
    if (listening) {
      recognitionRef.current?.stop();
      setListening(false);
      return;
    }
    const speechWindow = window as typeof window & {
      SpeechRecognition?: SpeechRecognitionConstructor;
      webkitSpeechRecognition?: SpeechRecognitionConstructor;
    };
    const Recognition = speechWindow.SpeechRecognition || speechWindow.webkitSpeechRecognition;
    if (!Recognition) {
      setSpeechNotice("Voice input is not supported by this browser. You can still type your question.");
      return;
    }
    const recognition = new Recognition();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = document.documentElement.lang || "en-NG";
    recognition.onresult = (event) => {
      const transcript = event.results[0]?.[0]?.transcript || "";
      setInput(transcript.slice(0, 500));
      setSpeechNotice("Voice captured. Review the text, then send it.");
    };
    recognition.onerror = () => setSpeechNotice("Voice input could not start. Check microphone permission or type your question.");
    recognition.onend = () => setListening(false);
    recognitionRef.current = recognition;
    setSpeechNotice("Listening… Your browser provides transcription. CDS Space does not send it to OpenAI.");
    setListening(true);
    recognition.start();
  };

  return (
    <div data-dashboard-guide className="pointer-events-none fixed inset-0 z-[138]" aria-live="polite">
      {open && (
        <>
          <button type="button" aria-label="Close page guide" className="pointer-events-auto absolute inset-0 bg-slate-950/20 backdrop-blur-[1px] md:bg-transparent md:backdrop-blur-none" onClick={() => setOpen(false)} />
          <section
            role="dialog"
            aria-modal="false"
            aria-label={`Page guide for ${context.title}`}
            className="pointer-events-auto absolute bottom-3 left-3 right-3 z-10 flex max-h-[min(680px,calc(100dvh-1.5rem))] flex-col overflow-hidden rounded-[1.75rem] border border-slate-200 bg-white text-[#0D1B39] shadow-[0_24px_70px_rgba(15,23,42,0.22)] md:bottom-5 md:left-auto md:right-5 md:max-h-[min(680px,calc(100dvh-2.5rem))] md:w-[390px]"
          >
            <header className="border-b border-slate-100 px-5 pb-4 pt-5">
              <div className="flex items-start gap-3">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#0A4FE8] text-white"><Bot size={21} aria-hidden="true" /></span>
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-semibold text-[#0A4FE8]">{context.portalLabel}</p>
                  <h2 className="truncate text-lg font-semibold">{context.title}</h2>
                </div>
                <button type="button" onClick={() => setOpen(false)} className="rounded-xl border border-slate-200 p-2 text-slate-500 transition hover:bg-slate-50 hover:text-slate-900" aria-label="Close page guide"><X size={17} /></button>
              </div>
              <div className="mt-4 flex items-start gap-2 rounded-2xl border border-emerald-100 bg-emerald-50 px-3 py-2.5 text-[11px] leading-4 text-emerald-900">
                <ShieldCheck size={16} className="mt-0.5 shrink-0 text-emerald-600" aria-hidden="true" />
                <span><strong>Private page guidance.</strong> I cannot see your records, files, messages or form entries, and nothing is sent to OpenAI.</span>
              </div>
            </header>

            <div ref={panelRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto px-5 py-4">
              {messages.map((message) => (
                <div key={message.id} className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}>
                  <p className={`max-w-[88%] whitespace-pre-line rounded-2xl px-3.5 py-2.5 text-sm leading-5 ${message.role === "user" ? "rounded-br-md bg-[#0A4FE8] text-white" : "rounded-bl-md bg-slate-100 text-slate-700"}`}>{message.text}</p>
                </div>
              ))}
              <div className="flex flex-wrap gap-2 pt-1">
                {questions.map((question) => (
                  <button key={question} type="button" onClick={() => ask(question)} className="rounded-full border border-blue-100 bg-blue-50 px-3 py-1.5 text-left text-[11px] font-medium text-[#0A4FE8] transition hover:border-blue-200 hover:bg-blue-100">{question}</button>
                ))}
              </div>
            </div>

            <form onSubmit={submit} className="border-t border-slate-100 bg-white p-4">
              {speechNotice && <p className="mb-2 text-[10px] leading-4 text-slate-500">{speechNotice}</p>}
              <div className="flex items-end gap-2 rounded-2xl border border-slate-200 bg-slate-50 p-2 focus-within:border-blue-300 focus-within:ring-4 focus-within:ring-blue-50">
                <label className="sr-only" htmlFor="cds-page-guide-input">Ask about this screen</label>
                <textarea id="cds-page-guide-input" value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); ask(input); } }} rows={1} maxLength={500} placeholder="Ask how to use this screen…" className="min-h-10 max-h-24 min-w-0 flex-1 resize-none bg-transparent px-2 py-2 text-sm outline-none placeholder:text-slate-400" />
                <button type="button" onClick={toggleSpeech} className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition ${listening ? "bg-rose-50 text-rose-600" : "bg-white text-slate-600 shadow-sm hover:text-[#0A4FE8]"}`} aria-label={listening ? "Stop voice input" : "Use voice input"}>{listening ? <MicOff size={18} /> : <Mic size={18} />}</button>
                <button type="submit" disabled={!input.trim()} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#0A4FE8] text-white transition hover:bg-[#0844c9] disabled:cursor-not-allowed disabled:opacity-40" aria-label="Send question"><Send size={17} /></button>
              </div>
              <p className="mt-2 text-center text-[10px] text-slate-400">Page guidance only · It cannot read or change your data</p>
            </form>
          </section>
        </>
      )}

      {position && !open && (
        <button
          type="button"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={() => { dragRef.current = null; }}
          className="pointer-events-auto absolute flex h-[52px] w-[52px] touch-none select-none items-center justify-center rounded-2xl border border-white/30 bg-[#0A4FE8] text-white shadow-[0_14px_34px_rgba(10,79,232,0.35)] transition-shadow hover:shadow-[0_18px_42px_rgba(10,79,232,0.44)] focus:outline-none focus:ring-4 focus:ring-blue-200"
          style={{ left: position.x, top: position.y }}
          aria-label={open ? "Move or close page guide" : "Move or open page guide"}
          title="Page guide, drag to move"
        >
          <Grip size={23} aria-hidden="true" />
          <span className="sr-only"><Move size={12} /> Drag to reposition</span>
        </button>
      )}
    </div>
  );
}
