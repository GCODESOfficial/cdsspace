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
};

type GuideContext = PageGuide & {
  portal: Portal;
  portalLabel: string;
  sections: Array<{ label: string; purpose: string }>;
  actions: GuideAction[];
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

const PAGE_GUIDES: Record<string, PageGuide> = {
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

function humanise(value: string) {
  return decodeURIComponent(value)
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function dashboardRoute(pathname: string): { portal: Portal; key: string } | null {
  const parts = pathname.split("/").filter(Boolean);
  if (pathname === "/create" || pathname.startsWith("/create/")) return { portal: "create", key: "create" };
  if (parts[0] === "admin" && parts[1] !== "login") return { portal: "admin", key: parts[1] || "dashboard" };
  if (parts[0] === "team" && !["login", "invite"].includes(parts[1] || "")) return { portal: "team", key: parts[1] || "dashboard" };
  if (parts[0] === "marketer" && !["login", "agreement", "onboarding"].includes(parts[1] || "")) return { portal: "marketer", key: parts[1] || "dashboard" };
  const dashboardIndex = parts.indexOf("dashboard");
  if (dashboardIndex >= 0) return { portal: "client", key: parts[dashboardIndex + 1] || "dashboard" };
  return null;
}

function getGuideContext(pathname: string): GuideContext | null {
  const route = dashboardRoute(pathname);
  if (!route) return null;
  const known = PAGE_GUIDES[route.key];
  const fallbackTitle = route.key === "dashboard" ? "Dashboard overview" : humanise(route.key);
  return {
    portal: route.portal,
    portalLabel: PORTAL_NAMES[route.portal],
    title: known?.title || fallbackTitle,
    summary: known?.summary || `Use this ${fallbackTitle.toLowerCase()} screen to review information and complete the actions available to your role.`,
    steps: known?.steps || ["Review the page summary and available filters", "Open the record you want to work with", "Use the primary action and check for confirmation"],
    sections: known?.sections || [{ label: fallbackTitle, purpose: known?.summary || `Review and complete the available ${fallbackTitle.toLowerCase()} workflows.` }],
    actions: known?.actions || [],
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
  const questions: string[] = [];
  if (context.actions[0]) questions.push(`What does ${context.actions[0].label} do?`);
  if (context.actions[1]) questions.push(`How do I use ${context.actions[1].label}?`);
  if (context.sections[0]) questions.push(`Explain the ${context.sections[0].label} section.`);
  questions.push("What should I do first on this page?");
  return questions.slice(0, 4);
}

function answerLocally(question: string, context: GuideContext) {
  const normal = question.toLowerCase();
  const action = context.actions.find((item) => normal.includes(item.label.toLowerCase()));
  if (action) {
    return `${action.label}: ${action.purpose}\n\nSteps:\n1. ${action.steps[0]}\n2. ${action.steps[1]}\n3. ${action.steps[2]}`;
  }
  const section = context.sections.find((item) => normal.includes(item.label.toLowerCase()));
  if (section) {
    const related = context.actions.filter((item) => item.label.toLowerCase().includes(section.label.toLowerCase().split(" ")[0])).slice(0, 3);
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
  const context = useMemo(() => getGuideContext(pathname), [pathname]);
  if (!context) return null;
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
    setMessages([{ id: nextId.current++, role: "guide", text: `${context.summary} Ask me how to use this screen.` }]);
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
