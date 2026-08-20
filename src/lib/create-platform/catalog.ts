export type CreateRole = "client" | "team" | "admin";
export type CreateToolStatus = "active" | "maintenance" | "disabled";
export type CreateStage = "phase_1" | "phase_2" | "phase_3";

export interface CreateTool {
  id?: string;
  slug: string;
  name: string;
  shortDescription: string;
  category: string;
  stage: CreateStage;
  status: CreateToolStatus;
  roleAccess: CreateRole[];
  creditCost: number;
  requiresProvider: boolean;
  providerKey: string | null;
  isBeta: boolean;
  isNew: boolean;
  isFeatured: boolean;
  supportsSimpleMode: boolean;
  supportsProMode: boolean;
  outputFormats: string[];
  adminNotes?: string | null;
}

export interface CreateCreditAccount {
  monthlyCreditLimit: number;
  creditsUsed: number;
  storageLimitBytes: number;
  storageUsedBytes: number;
  resetAt: string | null;
}

export interface CreateProject {
  id: string;
  name: string;
  description: string | null;
  color: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateTemplate {
  id: string;
  name: string;
  category: string;
  description: string;
  scope: "global" | "client" | "team" | "admin" | "public";
  status: "draft" | "published" | "archived";
  previewUrl: string | null;
  lockedFields: string[];
  editableFields: string[];
}

export interface CreateCreation {
  id: string;
  toolSlug: string;
  toolName: string;
  title: string;
  status: "draft" | "processing" | "ready" | "failed" | "provider_required";
  projectId: string | null;
  inputSummary: Record<string, unknown>;
  output: Record<string, unknown>;
  fileName: string | null;
  fileSizeBytes: number | null;
  outputFormat: string | null;
  isFavorite: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateDashboardData {
  tools: CreateTool[];
  favoriteToolSlugs: string[];
  recentCreations: CreateCreation[];
  projects: CreateProject[];
  templates: CreateTemplate[];
  creditAccount: CreateCreditAccount;
  analytics: {
    creations: number;
    downloads: number;
    ready: number;
    providerRequired: number;
    storageUsedBytes: number;
  };
}

export const CREATE_CATEGORIES = [
  "Design",
  "Image",
  "Video",
  "Brand",
  "Mockups",
  "Conversion",
] as const;

export const DEFAULT_CREATE_TOOLS: CreateTool[] = [
  {
    slug: "social-media-designer",
    name: "Social media designer",
    shortDescription: "Create professional campaign, announcement, event, and product posts using guided CDS Space templates.",
    category: "Design",
    stage: "phase_1",
    status: "active",
    roleAccess: ["client", "team", "admin"],
    creditCost: 2,
    requiresProvider: false,
    providerKey: null,
    isBeta: false,
    isNew: true,
    isFeatured: true,
    supportsSimpleMode: true,
    supportsProMode: true,
    outputFormats: ["PNG", "JPG"],
  },
  {
    slug: "birthday-template",
    name: "Birthday reusable template",
    shortDescription: "Generate locked-structure birthday graphics with editable name, photo, role, date, and message fields.",
    category: "Design",
    stage: "phase_1",
    status: "active",
    roleAccess: ["client", "team", "admin"],
    creditCost: 1,
    requiresProvider: false,
    providerKey: null,
    isBeta: false,
    isNew: true,
    isFeatured: true,
    supportsSimpleMode: true,
    supportsProMode: false,
    outputFormats: ["PNG", "JPG"],
  },
  {
    slug: "background-remover",
    name: "Background remover",
    shortDescription: "Remove image backgrounds, refine edges, and export transparent PNGs.",
    category: "Image",
    stage: "phase_1",
    status: "maintenance",
    roleAccess: ["client", "team", "admin"],
    creditCost: 1,
    requiresProvider: true,
    providerKey: "BACKGROUND_REMOVAL_PROVIDER",
    isBeta: true,
    isNew: false,
    isFeatured: true,
    supportsSimpleMode: true,
    supportsProMode: true,
    outputFormats: ["PNG", "JPG"],
  },
  {
    slug: "image-restorer",
    name: "Image restorer",
    shortDescription: "Improve poor-quality images with denoise, sharpen, upscale, and colour recovery options.",
    category: "Image",
    stage: "phase_1",
    status: "maintenance",
    roleAccess: ["client", "team", "admin"],
    creditCost: 3,
    requiresProvider: true,
    providerKey: "IMAGE_RESTORATION_PROVIDER",
    isBeta: true,
    isNew: false,
    isFeatured: false,
    supportsSimpleMode: true,
    supportsProMode: true,
    outputFormats: ["PNG", "JPG"],
  },
  {
    slug: "jpg-to-svg",
    name: "JPG to SVG",
    shortDescription: "Trace simple raster artwork into editable SVG paths with adjustable detail and smoothing.",
    category: "Conversion",
    stage: "phase_1",
    status: "active",
    roleAccess: ["client", "team", "admin"],
    creditCost: 2,
    requiresProvider: false,
    providerKey: null,
    isBeta: true,
    isNew: false,
    isFeatured: false,
    supportsSimpleMode: true,
    supportsProMode: true,
    outputFormats: ["SVG"],
  },
  {
    slug: "video-compressor",
    name: "Professional video compressor",
    shortDescription: "Reduce video file size with quality-focused presets for web, social, WhatsApp, and email.",
    category: "Video",
    stage: "phase_1",
    status: "maintenance",
    roleAccess: ["client", "team", "admin"],
    creditCost: 2,
    requiresProvider: true,
    providerKey: "VIDEO_COMPRESSION_WORKER",
    isBeta: true,
    isNew: false,
    isFeatured: true,
    supportsSimpleMode: true,
    supportsProMode: true,
    outputFormats: ["MP4"],
  },
  {
    slug: "barcode-generator",
    name: "Barcode generator",
    shortDescription: "Generate QR codes, Code 39 labels, and downloadable barcode assets for packaging or campaigns.",
    category: "Brand",
    stage: "phase_1",
    status: "active",
    roleAccess: ["client", "team", "admin"],
    creditCost: 0,
    requiresProvider: false,
    providerKey: null,
    isBeta: false,
    isNew: true,
    isFeatured: true,
    supportsSimpleMode: true,
    supportsProMode: true,
    outputFormats: ["PNG", "SVG", "PDF"],
  },
  {
    slug: "mockup-generator",
    name: "Mockup generator",
    shortDescription: "Create branded product, packaging, signage, device, and environmental mockup previews.",
    category: "Mockups",
    stage: "phase_1",
    status: "active",
    roleAccess: ["client", "team", "admin"],
    creditCost: 2,
    requiresProvider: false,
    providerKey: null,
    isBeta: true,
    isNew: true,
    isFeatured: true,
    supportsSimpleMode: true,
    supportsProMode: true,
    outputFormats: ["PNG", "JPG"],
  },
  {
    slug: "illustration-generator",
    name: "Illustration generator",
    shortDescription: "Generate professional illustrations from brand-aware creative prompts.",
    category: "Design",
    stage: "phase_2",
    status: "maintenance",
    roleAccess: ["team", "admin"],
    creditCost: 5,
    requiresProvider: true,
    providerKey: "IMAGE_GENERATION_PROVIDER",
    isBeta: true,
    isNew: false,
    isFeatured: false,
    supportsSimpleMode: true,
    supportsProMode: true,
    outputFormats: ["PNG"],
  },
  {
    slug: "vector-generator",
    name: "Vector generator",
    shortDescription: "Create SVG-style vector concepts from prompts or reference descriptions.",
    category: "Design",
    stage: "phase_2",
    status: "active",
    roleAccess: ["team", "admin"],
    creditCost: 3,
    requiresProvider: false,
    providerKey: null,
    isBeta: true,
    isNew: false,
    isFeatured: false,
    supportsSimpleMode: true,
    supportsProMode: true,
    outputFormats: ["PNG", "SVG"],
  },
  {
    slug: "clean-vector-tracer",
    name: "Clean vector tracer",
    shortDescription: "Produce simplified vector artwork for logos, icons, scanned files, and signage references.",
    category: "Image",
    stage: "phase_2",
    status: "maintenance",
    roleAccess: ["team", "admin"],
    creditCost: 4,
    requiresProvider: true,
    providerKey: "VECTOR_TRACE_PROVIDER",
    isBeta: true,
    isNew: false,
    isFeatured: false,
    supportsSimpleMode: true,
    supportsProMode: true,
    outputFormats: ["SVG"],
  },
  {
    slug: "logo-ideator",
    name: "Professional logo ideator",
    shortDescription: "Guide brand discovery and generate strategy-led logo directions, symbol ideas, and rationale.",
    category: "Brand",
    stage: "phase_2",
    status: "active",
    roleAccess: ["client", "team", "admin"],
    creditCost: 3,
    requiresProvider: false,
    providerKey: null,
    isBeta: true,
    isNew: false,
    isFeatured: false,
    supportsSimpleMode: true,
    supportsProMode: true,
    outputFormats: ["PDF", "TXT"],
  },
  {
    slug: "brand-name-checker",
    name: "Brand name checker",
    shortDescription: "Run a preliminary naming review across internal rules, social fit, domains, and similarity signals.",
    category: "Brand",
    stage: "phase_2",
    status: "active",
    roleAccess: ["client", "team", "admin"],
    creditCost: 1,
    requiresProvider: false,
    providerKey: null,
    isBeta: true,
    isNew: false,
    isFeatured: false,
    supportsSimpleMode: true,
    supportsProMode: false,
    outputFormats: ["PDF", "TXT"],
  },
  {
    slug: "logo-animation",
    name: "Logo animation generator",
    shortDescription: "Prepare reveal, fade, draw, morph, and motion presets for logo animation exports.",
    category: "Video",
    stage: "phase_2",
    status: "maintenance",
    roleAccess: ["team", "admin"],
    creditCost: 8,
    requiresProvider: true,
    providerKey: "LOGO_ANIMATION_WORKER",
    isBeta: true,
    isNew: false,
    isFeatured: false,
    supportsSimpleMode: true,
    supportsProMode: true,
    outputFormats: ["MP4", "WebM", "GIF"],
  },
  {
    slug: "figma-to-illustrator",
    name: "Figma to Illustrator converter",
    shortDescription: "Analyze Figma files, identify compatible vector layers, and export Illustrator-friendly fallbacks.",
    category: "Conversion",
    stage: "phase_3",
    status: "maintenance",
    roleAccess: ["team", "admin"],
    creditCost: 6,
    requiresProvider: true,
    providerKey: "FIGMA_CONVERSION_WORKER",
    isBeta: true,
    isNew: false,
    isFeatured: false,
    supportsSimpleMode: true,
    supportsProMode: true,
    outputFormats: ["AI", "SVG", "PDF"],
  },
];

export function createStageLabel(stage: CreateStage) {
  if (stage === "phase_1") return "Phase 1";
  if (stage === "phase_2") return "Phase 2";
  return "Phase 3";
}

export function canRoleUseTool(role: CreateRole, tool: Pick<CreateTool, "roleAccess" | "status">) {
  return tool.status !== "disabled" && tool.roleAccess.includes(role);
}

export function formatCreateBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value >= 10 || unit === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[unit]}`;
}
