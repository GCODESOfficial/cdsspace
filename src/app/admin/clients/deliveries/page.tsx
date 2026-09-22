"use client";

import { type ChangeEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  Archive,
  CheckCircle2,
  CircleAlert,
  ExternalLink,
  FileText,
  FolderKanban,
  FolderPlus,
  Image as ImageIcon,
  Link2,
  Loader2,
  PackageCheck,
  Pencil,
  RotateCcw,
  Save,
  Send,
  Trash2,
  Upload,
  UserRoundCheck,
  Users,
  X,
} from "lucide-react";
import { ClientRecipientPicker } from "@/components/deliveries/ClientRecipientPicker";
import { DeliveryFilePicker } from "@/components/deliveries/DeliveryFilePicker";
import { ProjectDriveManager } from "@/components/deliveries/ProjectDriveManager";
import { UniversalShareButton } from "@/components/share/UniversalShareButton";
import { CLIENT_BILLING_CURRENCY_OPTIONS } from "@/lib/client-billing";
import {
  DELIVERY_COVER_ACCEPT,
  deliveryFileRelativePath,
  MAX_DELIVERY_COVER_BYTES,
  MAX_DELIVERY_UPLOAD_CHUNK_BYTES,
} from "@/lib/client-deliveries";
import { absolutePublicUrl } from "@/lib/public-site";
import { publicDeliveryPath } from "@/lib/delivery-links";

interface Delivery {
  id: string;
  delivery_type: "brand_identity" | "design";
  title: string;
  description: string | null;
  status: string;
  project_id: string | null;
  project_name: string | null;
  client_name: string | null;
  client_user_id: string | null;
  manual_client_id: string | null;
  external_url: string | null;
  delivery_group_id: string | null;
  file_count: number;
  file_names: string[];
  attached_files: Array<{
    id: string;
    file_name: string;
    relative_path: string;
    file_size: number;
    mime_type: string | null;
    file_kind: string;
  }>;
  created_at: string;
  published_at: string | null;
  public_token: string;
  cover_version: string | null;
}

interface ClientOption {
  id: string;
  manual_client_id: string | null;
  platform_user_id: string | null;
  has_platform_account: boolean;
  name: string;
  brand_name: string | null;
  email: string | null;
}

interface ProjectOption {
  id: string;
  name: string;
  client: string | null;
  status: string;
  currency?: string | null;
}

interface Payload {
  deliveries: Delivery[];
  clients: ClientOption[];
  projects: ProjectOption[];
  capabilities: { create: boolean; send: boolean; editPublished: boolean; archive: boolean; deleteDraft: boolean };
}

interface DeliveryMutationResponse {
  error?: string;
  id?: string;
  recipient?: string;
  recipients?: Array<{ recipient: string; status: string }>;
  published?: number;
  held?: number;
}

const statusStyles: Record<string, string> = {
  awaiting_account: "bg-amber-50 text-amber-700",
  published: "bg-emerald-50 text-emerald-700",
  archived: "bg-slate-100 text-slate-600",
  submitted: "bg-blue-50 text-blue-700",
  draft: "bg-gray-100 text-gray-600",
};

function deliveryStatusLabel(status: string) {
  const label = status.replaceAll("_", " ");
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function clientReference(client: ClientOption) {
  return client.manual_client_id ? `manual:${client.manual_client_id}` : `profile:${client.platform_user_id}`;
}

function clientName(client: ClientOption) {
  return client.brand_name || client.name || client.email || "Unnamed client";
}

/** Rebuild the recipient reference stored on a delivery so it matches a client option. */
function deliveryRecipientRef(delivery: Delivery) {
  if (delivery.manual_client_id) return `manual:${delivery.manual_client_id}`;
  if (delivery.client_user_id) return `profile:${delivery.client_user_id}`;
  return "";
}

function fileSelectionKey(file: File) {
  return `${deliveryFileRelativePath(file)}:${file.size}:${file.lastModified}`;
}

export default function ClientDeliveriesPage() {
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingIntent, setSavingIntent] = useState<"draft" | "send" | "update" | null>(null);
  const [sendingExisting, setSendingExisting] = useState(false);
  const [deletingDraftId, setDeletingDraftId] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  // Controlled form state (so a draft can be reopened and continued later).
  const [draftId, setDraftId] = useState<string | null>(null);
  const [editingPublished, setEditingPublished] = useState(false);
  const [changingArchiveId, setChangingArchiveId] = useState<string | null>(null);
  const [deliveryType, setDeliveryType] = useState<"brand_identity" | "design">("design");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [externalUrl, setExternalUrl] = useState("");
  const [recipient, setRecipient] = useState("");
  const [extraRecipients, setExtraRecipients] = useState<string[]>([]);
  const [projectId, setProjectId] = useState("");
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [removedFileIds, setRemovedFileIds] = useState<string[]>([]);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [coverPreviewUrl, setCoverPreviewUrl] = useState("");

  const [newProjectOpen, setNewProjectOpen] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");
  const [newProjectClient, setNewProjectClient] = useState("");
  const [newProjectCurrency, setNewProjectCurrency] = useState("NGN");
  const [projectSaving, setProjectSaving] = useState(false);
  const [deliveryRecipients, setDeliveryRecipients] = useState<Record<string, string>>({});

  const formSectionRef = useRef<HTMLDivElement | null>(null);
  const coverInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => () => {
    if (coverPreviewUrl) URL.revokeObjectURL(coverPreviewUrl);
  }, [coverPreviewUrl]);

  const load = useCallback(async () => {
    setLoading(true);
    const response = await fetch("/api/admin/clients/deliveries", { cache: "no-store" });
    const json = await response.json().catch(() => ({}));
    if (!response.ok) setNotice({ tone: "error", text: json.error || "Could not load deliveries." });
    else {
      setData(json);
      setDeliveryRecipients((current) => Object.fromEntries(
        (json.deliveries || []).map((delivery: Delivery) => [
          delivery.id,
          current[delivery.id] || deliveryRecipientRef(delivery),
        ]),
      ));
    }
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const recipientOptions = useMemo(
    () => (data?.clients || []).map((client) => ({
      value: clientReference(client),
      name: clientName(client),
      email: client.email,
      hasPlatformAccount: client.has_platform_account,
    })),
    [data?.clients],
  );

  const recipientValues = useMemo(
    () => [recipient, ...extraRecipients].filter(Boolean),
    [extraRecipients, recipient],
  );

  const manualRecipientCount = useMemo(
    () => recipientValues.reduce((count, value) => {
      const client = data?.clients.find((candidate) => clientReference(candidate) === value);
      return count + (client && !client.has_platform_account ? 1 : 0);
    }, 0),
    [data?.clients, recipientValues],
  );

  // The draft currently being edited (for the "already attached" files hint).
  const editingDelivery = useMemo(
    () => (draftId ? data?.deliveries.find((delivery) => delivery.id === draftId) || null : null),
    [data?.deliveries, draftId],
  );

  const canAddRecipients = deliveryType === "design";

  function clearSelectedCover() {
    setCoverFile(null);
    setCoverPreviewUrl("");
    if (coverInputRef.current) coverInputRef.current.value = "";
  }

  function chooseCover(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] || null;
    if (!file) return;
    if (!DELIVERY_COVER_ACCEPT.split(",").includes(file.type)) {
      event.target.value = "";
      setNotice({ tone: "error", text: "Choose a JPG, PNG, or WebP image for the delivery cover." });
      return;
    }
    if (file.size > MAX_DELIVERY_COVER_BYTES) {
      event.target.value = "";
      setNotice({ tone: "error", text: "The delivery cover must be 10MB or smaller." });
      return;
    }
    setCoverFile(file);
    setCoverPreviewUrl(URL.createObjectURL(file));
    setNotice(null);
  }

  function updateRecipients(values: string[]) {
    const unique = Array.from(new Set(values.filter(Boolean)));
    const primary = unique[0] || "";
    setRecipient(primary);
    setExtraRecipients(canAddRecipients ? unique.slice(1) : []);
    if (!newProjectClient && primary) setNewProjectClient(primary);
  }

  function toggleAttachedFileRemoval(fileId: string) {
    setRemovedFileIds((current) => current.includes(fileId)
      ? current.filter((id) => id !== fileId)
      : [...current, fileId]);
  }

  const drafts = useMemo(
    () => (data?.deliveries || []).filter((delivery) => delivery.status === "draft"),
    [data?.deliveries],
  );

  const historyDeliveries = useMemo(
    () => (data?.deliveries || []).filter((delivery) => !["draft", "archived"].includes(delivery.status)),
    [data?.deliveries],
  );

  const archivedDeliveries = useMemo(
    () => (data?.deliveries || []).filter((delivery) => delivery.status === "archived"),
    [data?.deliveries],
  );

  function resetForm() {
    setDraftId(null);
    setEditingPublished(false);
    setDeliveryType("design");
    setTitle("");
    setDescription("");
    setExternalUrl("");
    setRecipient("");
    setExtraRecipients([]);
    setProjectId("");
    setSelectedFiles([]);
    setRemovedFileIds([]);
    clearSelectedCover();
    setNewProjectOpen(false);
  }

  function startEditingDraft(delivery: Delivery) {
    setDraftId(delivery.id);
    setEditingPublished(false);
    setDeliveryType(delivery.delivery_type);
    setTitle(delivery.title);
    setDescription(delivery.description || "");
    setExternalUrl(delivery.external_url || "");
    setRecipient(deliveryRecipientRef(delivery));
    setExtraRecipients([]);
    setProjectId(delivery.project_id || "");
    setSelectedFiles([]);
    setRemovedFileIds([]);
    clearSelectedCover();
    setNotice({ tone: "ok", text: `Continuing "${delivery.title}". Add anything missing, then save the draft again or send it.` });
    formSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function startEditingPublished(delivery: Delivery) {
    setDraftId(delivery.id);
    setEditingPublished(true);
    setDeliveryType(delivery.delivery_type);
    setTitle(delivery.title);
    setDescription(delivery.description || "");
    setExternalUrl(delivery.external_url || "");
    setRecipient(deliveryRecipientRef(delivery));
    setExtraRecipients([]);
    setProjectId(delivery.project_id || "");
    setSelectedFiles([]);
    setRemovedFileIds([]);
    clearSelectedCover();
    setNotice({ tone: "ok", text: `Editing “${delivery.title}”. The recipient and delivery type remain locked to preserve the handover record.` });
    formSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function deleteDraft(delivery: Delivery) {
    if (!window.confirm(`Delete the saved draft “${delivery.title}”? Its uploaded draft files will also be removed.`)) return;
    setDeletingDraftId(delivery.id);
    setNotice(null);
    const response = await fetch(`/api/admin/clients/deliveries?id=${encodeURIComponent(delivery.id)}`, {
      method: "DELETE",
    });
    const json = await response.json().catch(() => ({}));
    setDeletingDraftId(null);
    if (!response.ok) {
      setNotice({ tone: "error", text: json.error || "Could not delete the saved draft." });
      return;
    }
    if (draftId === delivery.id) resetForm();
    setNotice({ tone: "ok", text: `Draft “${delivery.title}” was deleted.` });
    await load();
  }

  async function submitDelivery(intent: "draft" | "send" | "update") {
    if (title.trim().length < 3) {
      setNotice({ tone: "error", text: "Add a delivery title of at least 3 characters." });
      return;
    }
    if (deliveryType === "brand_identity" && !projectId) {
      setNotice({ tone: "error", text: "Choose the completed project for this brand identity." });
      return;
    }
    const extras = extraRecipients.map((value) => value.trim()).filter(Boolean);
    if (intent === "send") {
      if (!recipient) {
        setNotice({ tone: "error", text: "Choose at least one receiving client." });
        return;
      }
      if (deliveryType === "brand_identity" && extras.length) {
        setNotice({ tone: "error", text: "A brand identity can only go to its single project owner." });
        return;
      }
      if (!coverFile && !editingDelivery?.cover_version) {
        setNotice({ tone: "error", text: "Upload a delivery cover before sending this handover." });
        return;
      }
    }
    if (removedFileIds.length && !window.confirm(
      `Remove ${removedFileIds.length} attached file${removedFileIds.length === 1 ? "" : "s"} from this delivery? Clients will no longer be able to access ${removedFileIds.length === 1 ? "it" : "them"} after you save.`,
    )) return;

    setSavingIntent(intent);
    setNotice(null);
    let workingDeliveryId = draftId;

    const postDelivery = async (
      requestIntent: "draft" | "upload" | "send" | "update",
      includeCover = false,
      includeRemovals = false,
    ) => {
      const payload = new FormData();
      payload.set("intent", requestIntent);
      if (workingDeliveryId) payload.set("delivery_id", workingDeliveryId);
      payload.set("delivery_type", deliveryType);
      payload.set("title", title);
      payload.set("description", description);
      payload.set("project_id", projectId);
      payload.set("external_url", externalUrl);
      if (includeCover && coverFile) payload.set("cover_image", coverFile, coverFile.name);
      if (includeRemovals) removedFileIds.forEach((id) => payload.append("remove_file_id", id));
      if (!editingPublished && recipient) payload.append("client_reference", recipient);
      if (!editingPublished && canAddRecipients) extras.forEach((value) => payload.append("client_reference", value));
      const response = await fetch("/api/admin/clients/deliveries", { method: "POST", body: payload });
      const json = await response.json().catch(() => ({})) as DeliveryMutationResponse;
      if (!response.ok) {
        const fallback = response.status === 413
          ? "This delivery request is too large for the server."
          : "Could not save the delivery.";
        throw new Error(json.error || fallback);
      }
      if (json.id) workingDeliveryId = json.id;
      if (includeCover && coverFile) clearSelectedCover();
      return json;
    };

    /** The server refused this one file (type, content or size) - skip it, keep delivering. */
    class SkippedFileError extends Error {}
    const isFileRejection = (status: number) => status === 400 || status === 413 || status === 415 || status === 422;

    const uploadFileInChunks = async (deliveryId: string, file: File, fileIndex: number, fileTotal: number) => {
      if (!file.size) throw new Error(`${file.name} is empty and cannot be uploaded.`);
      const uploadId = crypto.randomUUID();
      const chunkCount = Math.ceil(file.size / MAX_DELIVERY_UPLOAD_CHUNK_BYTES);
      const relativePath = deliveryFileRelativePath(file);
      const baseParams = new URLSearchParams({
        delivery_id: deliveryId,
        upload_id: uploadId,
        chunk_count: String(chunkCount),
        file_size: String(file.size),
        file_name: file.name,
        relative_path: relativePath,
      });

      try {
        for (let chunkIndex = 0; chunkIndex < chunkCount; chunkIndex += 1) {
          const start = chunkIndex * MAX_DELIVERY_UPLOAD_CHUNK_BYTES;
          const end = Math.min(file.size, start + MAX_DELIVERY_UPLOAD_CHUNK_BYTES);
          const chunk = file.slice(start, end);
          const params = new URLSearchParams(baseParams);
          params.set("chunk_index", String(chunkIndex));
          setNotice({
            tone: "ok",
            text: `Uploading file ${fileIndex + 1} of ${fileTotal}, chunk ${chunkIndex + 1} of ${chunkCount}…`,
          });

          let uploaded = false;
          let lastError = "Could not upload this file chunk.";
          for (let attempt = 0; attempt < 3 && !uploaded; attempt += 1) {
            try {
              const response = await fetch(`/api/admin/clients/deliveries/upload?${params.toString()}`, {
                method: "POST",
                headers: { "Content-Type": "application/octet-stream" },
                body: chunk,
              });
              const result = await response.json().catch(() => ({}));
              if (response.ok) {
                uploaded = true;
                break;
              }
              lastError = result.error || (response.status === 413
                ? "A file chunk exceeded the 48MB upload limit."
                : "Could not upload this file chunk.");
              if (isFileRejection(response.status)) throw new SkippedFileError(`${relativePath}: ${lastError}`);
              if (response.status < 500 && response.status !== 409) break;
            } catch (error) {
              if (error instanceof SkippedFileError) throw error;
              lastError = error instanceof Error ? error.message : lastError;
            }
            if (attempt < 2) await new Promise((resolve) => window.setTimeout(resolve, 500 * (attempt + 1)));
          }
          if (!uploaded) throw new Error(`${relativePath}: ${lastError}`);
        }

        const response = await fetch("/api/admin/clients/deliveries/upload", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            delivery_id: deliveryId,
            upload_id: uploadId,
            chunk_count: chunkCount,
            file_size: file.size,
            file_name: file.name,
            relative_path: relativePath,
          }),
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) {
          const message = result.error || `Could not finish uploading ${relativePath}.`;
          if (isFileRejection(response.status)) throw new SkippedFileError(message);
          throw new Error(message);
        }
      } catch (error) {
        const cleanup = new URLSearchParams(baseParams);
        cleanup.set("chunk_index", "0");
        await fetch(`/api/admin/clients/deliveries/upload?${cleanup.toString()}`, { method: "DELETE" }).catch(() => undefined);
        throw error;
      }
    };

    let json: DeliveryMutationResponse = {};
    const skippedFiles: string[] = [];
    /** Appended to every success message so the sender knows what was left out. */
    const skippedNote = () => skippedFiles.length
      ? ` ${skippedFiles.length} file${skippedFiles.length === 1 ? " was" : "s were"} left out: ${skippedFiles.join("; ")}`
      : "";
    try {
      const filesToUpload = [...selectedFiles];
      if (filesToUpload.length) {
        if (intent !== "update") {
          json = await postDelivery(intent === "draft" ? "draft" : "upload", Boolean(coverFile), false);
          if (workingDeliveryId) setDraftId(workingDeliveryId);
        }
        if (!workingDeliveryId) throw new Error("Could not prepare the delivery draft for file uploads.");

        for (const [index, file] of filesToUpload.entries()) {
          try {
            await uploadFileInChunks(workingDeliveryId, file, index, filesToUpload.length);
          } catch (error) {
            // One unacceptable file must not cost the client the rest of the handover.
            if (!(error instanceof SkippedFileError)) throw error;
            skippedFiles.push(error.message);
          }
          const completedKey = fileSelectionKey(file);
          setSelectedFiles((current) => current.filter((candidate) => fileSelectionKey(candidate) !== completedKey));
        }
        if (skippedFiles.length === filesToUpload.length) {
          throw new Error(`None of the files could be delivered:\n${skippedFiles.join("\n")}`);
        }

        if (intent === "send") json = await postDelivery("send", false, true);
        if (intent === "update") json = await postDelivery("update", Boolean(coverFile), true);
        if (intent === "draft" && removedFileIds.length) json = await postDelivery("draft", false, true);
      } else {
        json = await postDelivery(intent, Boolean(coverFile), true);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not save the delivery.";
      setSavingIntent(null);
      if (workingDeliveryId) {
        setDraftId(workingDeliveryId);
        await load();
      }
      setNotice({ tone: "error", text: message });
      return;
    }
    setSavingIntent(null);

    if (intent === "draft") {
      setDraftId(workingDeliveryId || json.id || null);
      setSelectedFiles([]);
      setRemovedFileIds([]);
      setNotice({ tone: "ok", text: `Draft saved. You can pick it back up any time from Saved drafts below.${skippedNote()}` });
      await load();
      return;
    }

    if (intent === "update") {
      const updatedTitle = title;
      resetForm();
      setNotice({ tone: "ok", text: `“${updatedTitle}” was updated without replacing its delivery record or public link.${skippedNote()}` });
      await load();
      return;
    }

    resetForm();
    const recipients: Array<{ recipient: string; status: string }> = json.recipients || [];
    const published = json.published ?? recipients.filter((r) => r.status === "published").length;
    const held = json.held ?? recipients.filter((r) => r.status !== "published").length;
    const names = recipients.map((r) => r.recipient).join(", ") || json.recipient;
    let text: string;
    if (recipients.length > 1) {
      text = `Sent to ${recipients.length} clients (${names}).` + (held ? ` ${held} held until their account is created.` : "");
    } else {
      text = published
        ? `${json.recipient} can now access the finished files in their account.`
        : `${json.recipient}'s files are secured. Invite or merge their account to release the delivery.`;
    }
    setNotice({ tone: "ok", text: `${text}${skippedNote()}` });
    await load();
  }

  async function createProjectOnTheGo() {
    const projectClient = newProjectClient || recipient;
    if (newProjectName.trim().length < 3 || !projectClient) {
      setNotice({ tone: "error", text: "Add a project name and choose its client." });
      return;
    }
    setProjectSaving(true);
    setNotice(null);
    const response = await fetch("/api/admin/clients/deliveries/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newProjectName, client_reference: projectClient, currency: newProjectCurrency }),
    });
    const json = await response.json().catch(() => ({}));
    setProjectSaving(false);
    if (!response.ok) {
      setNotice({ tone: "error", text: json.error || "Could not create the project." });
      return;
    }
    const project = json.project as ProjectOption;
    setData((current) => current ? { ...current, projects: [project, ...current.projects.filter((item) => item.id !== project.id)] } : current);
    setProjectId(project.id);
    setNewProjectName("");
    setNewProjectOpen(false);
    setNotice({ tone: "ok", text: `${project.name} was created and selected.` });
  }

  async function sendExistingDelivery(delivery: Delivery) {
    const client = deliveryRecipients[delivery.id];
    if (!client) return;
    setSendingExisting(true);
    setNotice(null);
    const response = await fetch("/api/admin/clients/deliveries", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: delivery.id, client_reference: client }),
    });
    const json = await response.json().catch(() => ({}));
    setSendingExisting(false);
    if (!response.ok) {
      setNotice({ tone: "error", text: json.error || "Could not send the existing delivery." });
      return;
    }
    setNotice({ tone: "ok", text: json.status === "published" ? `Delivery sent to ${json.recipient}.` : `Delivery assigned to ${json.recipient} and held until account creation.` });
    await load();
  }

  async function changeArchiveState(delivery: Delivery, action: "archive" | "restore") {
    const message = action === "archive"
      ? `Archive “${delivery.title}”? It will be removed from the client account and its public link will stop working. No files will be deleted.`
      : `Restore “${delivery.title}” to the client account?`;
    if (!window.confirm(message)) return;
    setChangingArchiveId(delivery.id);
    setNotice(null);
    const response = await fetch("/api/admin/clients/deliveries", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: delivery.id, action }),
    });
    const json = await response.json().catch(() => ({}));
    setChangingArchiveId(null);
    if (!response.ok) {
      setNotice({ tone: "error", text: json.error || `Could not ${action} the delivery.` });
      return;
    }
    if (draftId === delivery.id) resetForm();
    setNotice({ tone: "ok", text: action === "archive" ? `“${delivery.title}” was archived. Its files remain preserved.` : `“${delivery.title}” is available again.` });
    await load();
  }

  const busy = savingIntent !== null;
  const coverDisplayUrl = coverPreviewUrl || (editingDelivery?.cover_version
    ? `/api/admin/clients/deliveries/${editingDelivery.id}/cover?v=${editingDelivery.cover_version}`
    : "");

  return (
    <main className="mx-auto w-full max-w-[1500px] p-4 sm:p-6 lg:p-8">
      <header className="mb-7 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-semibold text-[#0A4FE8]">Sales Hub</p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-[#07133B]">Client Deliveries</h1>
          <p className="mt-2 max-w-3xl text-sm text-gray-500">
            Send finished design files, folders, documents, or Google Drive links directly to the receiving client.
          </p>
        </div>
        <div className="inline-flex items-center gap-2 self-start rounded-xl border border-blue-100 bg-white px-4 py-3 text-xs font-semibold text-[#0A4FE8] shadow-sm">
          <PackageCheck className="h-4 w-4" /> Finished-work handover
        </div>
      </header>

      {notice && (
        <div className={`mb-5 whitespace-pre-line rounded-xl border px-4 py-3 text-sm ${notice.tone === "ok" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-rose-200 bg-rose-50 text-rose-700"}`}>
          {notice.text}
        </div>
      )}

      <ProjectDriveManager />

      {(data?.capabilities.create || data?.capabilities.send) && (
        <section ref={formSectionRef} className="mb-7 rounded-2xl border border-gray-100 bg-white p-5 shadow-sm sm:p-6">
          <div className="mb-5 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="grid h-11 w-11 place-items-center rounded-xl bg-blue-50 text-[#0A4FE8]"><Send className="h-5 w-5" /></div>
              <div>
                <h2 className="font-bold text-[#07133B]">{editingPublished ? "Edit an existing delivery" : draftId ? "Continue a saved draft" : "Send a finished delivery"}</h2>
                <p className="text-xs text-gray-500">{editingPublished ? "Update its handover details or append files without replacing the audit record or public link." : "Choose the client first, then attach all final deliverables in one handover."}</p>
              </div>
            </div>
            {draftId && (
              <button type="button" onClick={resetForm} className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-500 hover:bg-gray-50">
                <RotateCcw className="h-3.5 w-3.5" /> Close editor
              </button>
            )}
          </div>
          {draftId && (
            <div className="mb-4 flex items-center gap-2 rounded-xl border border-blue-100 bg-blue-50/60 px-3 py-2.5 text-xs text-[#0A4FE8]">
              <Pencil className="h-3.5 w-3.5 shrink-0" />
              <span>{editingPublished ? "Editing a sent delivery." : "Editing a saved draft."} {editingDelivery?.file_count ? `${editingDelivery.file_count} file${editingDelivery.file_count === 1 ? "" : "s"} already attached` : "No files attached yet"}. Add new files below or mark existing files for removal.</span>
            </div>
          )}
          <div className="grid gap-4 lg:grid-cols-2">
            {editingPublished ? (
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-600 lg:col-span-2">
                <span className="font-bold text-[#07133B]">Receiving client:</span> {editingDelivery?.client_name || "Client"}
                <span className="ml-2 text-slate-400">Locked to preserve delivery ownership and audit history.</span>
              </div>
            ) : (
              <div className="text-xs font-semibold text-gray-600 lg:col-span-2">
                <div className="mb-1.5 flex items-center justify-between gap-3">
                  <span>Receiving client{canAddRecipients ? "s" : ""}</span>
                  {canAddRecipients && <span className="font-normal text-gray-400">Select one or multiple clients</span>}
                </div>
                <ClientRecipientPicker options={recipientOptions} values={recipientValues} onChange={updateRecipients} multiple={canAddRecipients} />
                {canAddRecipients && <p className="mt-2 text-[11px] font-normal text-gray-400">Each selected client receives their own copy of the same finished work. All copies are logged together.</p>}
              </div>
            )}
            {!editingPublished && manualRecipientCount > 0 && (
              <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-800 lg:col-span-2">
                <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{manualRecipientCount === 1 ? "One selected client has" : `${manualRecipientCount} selected clients have`} no platform account. Their files will be held securely until you invite or merge them from the Client List.</span>
              </div>
            )}
            <label className="text-xs font-semibold text-gray-600">
              Delivery type
              <select disabled={editingPublished} value={deliveryType} onChange={(event) => { const next = event.target.value as "brand_identity" | "design"; setDeliveryType(next); if (next === "brand_identity") setExtraRecipients([]); }} className="mt-1.5 h-11 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm outline-none focus:border-blue-400 disabled:cursor-not-allowed disabled:bg-gray-50 disabled:text-gray-500">
                <option value="design">Design deliverable</option>
                <option value="brand_identity">Brand identity</option>
              </select>
            </label>
            <label className="text-xs font-semibold text-gray-600">
              Delivery title
              <input value={title} onChange={(event) => setTitle(event.target.value)} minLength={3} placeholder="e.g. Q3 campaign final design pack" className="mt-1.5 h-11 w-full rounded-xl border border-gray-200 px-3 text-sm outline-none focus:border-blue-400" />
            </label>
            <div className="lg:col-span-2">
              <div className="flex flex-wrap items-end justify-between gap-2">
                <div>
                  <p className="text-xs font-semibold text-gray-600">Delivery cover image</p>
                  <p className="mt-1 text-[11px] text-gray-400">Used as the large preview image when the public delivery link is shared. The image is safely cropped to 1200 × 630.</p>
                </div>
                <span className="text-[10px] font-medium text-[#0A4FE8]">JPG, PNG, or WebP · 10MB max</span>
              </div>
              <div className="mt-2.5 grid gap-3 rounded-xl border border-gray-200 bg-[#F8FAFD] p-3 sm:grid-cols-[220px_1fr] sm:items-center">
                <div className="relative aspect-[1200/630] overflow-hidden rounded-lg border border-gray-200 bg-white">
                  {coverDisplayUrl ? (
                    <img src={coverDisplayUrl} alt="Delivery cover preview" className="h-full w-full object-cover" />
                  ) : (
                    <span className="grid h-full w-full place-items-center text-gray-300"><ImageIcon className="h-8 w-8" /></span>
                  )}
                </div>
                <div>
                  <input ref={coverInputRef} type="file" accept={DELIVERY_COVER_ACCEPT} onChange={chooseCover} className="sr-only" />
                  <div className="flex flex-wrap gap-2">
                    <button type="button" onClick={() => coverInputRef.current?.click()} className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-[#0A4FE8] px-4 text-xs font-semibold text-white hover:bg-blue-700">
                      <Upload className="h-4 w-4" /> {coverDisplayUrl ? "Replace cover" : "Upload cover"}
                    </button>
                    {coverFile && (
                      <button type="button" onClick={clearSelectedCover} className="inline-flex min-h-10 items-center rounded-lg border border-gray-200 bg-white px-4 text-xs font-semibold text-gray-600 hover:bg-gray-50">
                        Undo selection
                      </button>
                    )}
                  </div>
                  <p className="mt-2 text-[11px] leading-5 text-gray-500">
                    {editingDelivery?.cover_version && !coverFile
                      ? "The current cover remains in use until you choose and save a replacement."
                      : coverFile
                        ? `${coverFile.name} will become the metadata image after you save.`
                        : "A cover is required before sending. You may save a draft without one."}
                  </p>
                </div>
              </div>
            </div>
            <label className="text-xs font-semibold text-gray-600 lg:col-span-2">
              Handover note
              <textarea value={description} onChange={(event) => setDescription(event.target.value)} rows={3} placeholder="Describe the finished files and any usage notes for the client." className="mt-1.5 w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-blue-400" />
            </label>
            <div className="lg:col-span-2">
              <p className="text-xs font-semibold text-gray-600">{deliveryType === "brand_identity" ? "Completed project" : "Project (optional)"}</p>
              <div className="mt-1.5 flex flex-col gap-2 sm:flex-row">
                <select value={projectId} onChange={(event) => setProjectId(event.target.value)} className="h-11 min-w-0 flex-1 rounded-xl border border-gray-200 bg-white px-3 text-sm outline-none focus:border-blue-400">
                  <option value="">Choose a project</option>
                  {(data?.projects || []).map((project) => <option key={project.id} value={project.id}>{project.name}{project.client ? `: ${project.client}` : ""}</option>)}
                </select>
                {data.capabilities.create && <button type="button" onClick={() => setNewProjectOpen((open) => !open)} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-4 text-xs font-bold text-[#0A4FE8] hover:bg-blue-100">
                  <FolderPlus className="h-4 w-4" /> {newProjectOpen ? "Close" : "Create new project"}
                </button>}
              </div>
              {newProjectOpen && (
                <div className="mt-3 grid gap-3 rounded-xl border border-blue-100 bg-blue-50/40 p-4 md:grid-cols-3">
                  <label className="text-[11px] font-semibold text-gray-600">Project name<input value={newProjectName} onChange={(event) => setNewProjectName(event.target.value)} placeholder="e.g. Dubai identity handover" className="mt-1.5 h-10 w-full rounded-lg border border-gray-200 bg-white px-3 text-xs outline-none focus:border-blue-400" /></label>
                  <div className="text-[11px] font-semibold text-gray-600">Client<div className="mt-1.5"><ClientRecipientPicker options={recipientOptions} values={[newProjectClient || recipient].filter(Boolean)} onChange={(values) => setNewProjectClient(values[0] || "")} multiple={false} /></div></div>
                  <label className="text-[11px] font-semibold text-gray-600">Currency<select value={newProjectCurrency} onChange={(event) => setNewProjectCurrency(event.target.value)} className="mt-1.5 h-10 w-full rounded-lg border border-gray-200 bg-white px-3 text-xs outline-none focus:border-blue-400">{CLIENT_BILLING_CURRENCY_OPTIONS.map((currency) => <option key={currency.code} value={currency.code}>{currency.code}: {currency.name}</option>)}</select></label>
                  <div className="md:col-span-3"><button type="button" disabled={projectSaving || newProjectName.trim().length < 3 || !(newProjectClient || recipient)} onClick={() => void createProjectOnTheGo()} className="inline-flex h-10 items-center gap-2 rounded-lg bg-[#0A4FE8] px-4 text-xs font-bold text-white disabled:opacity-50">{projectSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <FolderPlus className="h-4 w-4" />} Create and select project</button></div>
                </div>
              )}
            </div>
            {deliveryType === "design" && (
              <label className="text-xs font-semibold text-gray-600 lg:col-span-2">
                Google Drive/Docs link (optional)
                <span className="relative mt-1.5 block"><Link2 className="absolute left-3 top-3 h-4 w-4 text-gray-400" /><input value={externalUrl} onChange={(event) => setExternalUrl(event.target.value)} type="url" placeholder="https://drive.google.com/..." className="h-11 w-full rounded-xl border border-gray-200 pl-9 pr-3 text-sm outline-none focus:border-blue-400" /></span>
              </label>
            )}
            {editingDelivery && editingDelivery.attached_files?.length > 0 && (
              <div className="lg:col-span-2">
                <div className="flex flex-wrap items-end justify-between gap-2">
                  <div>
                    <p className="text-xs font-semibold text-gray-600">Already attached</p>
                    <p className="mt-1 text-[11px] text-gray-400">Use the remove button on a file, then save the delivery to apply the change.</p>
                  </div>
                  {removedFileIds.length > 0 && (
                    <button type="button" onClick={() => setRemovedFileIds([])} className="text-[11px] font-semibold text-[#0A4FE8] hover:underline">
                      Keep all files
                    </button>
                  )}
                </div>
                <div className="mt-1.5 flex flex-wrap gap-2">
                  {editingDelivery.attached_files.map((file) => {
                    const removing = removedFileIds.includes(file.id);
                    return (
                      <span key={file.id} className={`inline-flex max-w-full items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[11px] ${removing ? "border-rose-200 bg-rose-50 text-rose-700" : "border-gray-200 bg-gray-50 text-gray-600"}`}>
                        <FileText className="h-3 w-3 shrink-0" />
                        <span className={`max-w-[320px] truncate ${removing ? "line-through" : ""}`}>{file.relative_path || file.file_name}</span>
                        <button
                          type="button"
                          onClick={() => toggleAttachedFileRemoval(file.id)}
                          aria-label={removing ? `Keep ${file.file_name}` : `Remove ${file.file_name}`}
                          title={removing ? "Keep this file" : "Remove this file"}
                          className={`ml-0.5 grid h-5 w-5 shrink-0 place-items-center rounded ${removing ? "text-rose-700 hover:bg-rose-100" : "text-gray-400 hover:bg-rose-50 hover:text-rose-600"}`}
                        >
                          {removing ? <RotateCcw className="h-3 w-3" /> : <X className="h-3 w-3" />}
                        </button>
                      </span>
                    );
                  })}
                </div>
                {removedFileIds.length > 0 && (
                  <p role="status" className="mt-2 text-[11px] font-medium text-rose-600">
                    {removedFileIds.length} file{removedFileIds.length === 1 ? "" : "s"} will be permanently removed when you save this delivery.
                  </p>
                )}
              </div>
            )}
            <DeliveryFilePicker files={selectedFiles} onChange={setSelectedFiles} label={editingDelivery ? "Add more finished assets or folders (optional)" : "Finished files, folders, ZIP bundles, or documents"} />
            <div className="flex flex-wrap items-center gap-3 lg:col-span-2">
              {editingPublished && data.capabilities.editPublished ? (
                <button type="button" disabled={busy} onClick={() => void submitDelivery("update")} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#0A4FE8] px-5 text-sm font-bold text-white shadow-md shadow-blue-200 hover:bg-blue-700 disabled:opacity-60">
                  {savingIntent === "update" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Update delivery
                </button>
              ) : data.capabilities.send && (
                <button type="button" disabled={busy || !recipient} onClick={() => void submitDelivery("send")} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#0A4FE8] px-5 text-sm font-bold text-white shadow-md shadow-blue-200 hover:bg-blue-700 disabled:opacity-60">
                  {savingIntent === "send" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} {extraRecipients.filter(Boolean).length ? `Send to ${extraRecipients.filter(Boolean).length + 1} clients` : "Send to client"}
                </button>
              )}
              {!editingPublished && data.capabilities.create && <button type="button" disabled={busy} onClick={() => void submitDelivery("draft")} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-gray-200 bg-white px-5 text-sm font-bold text-gray-600 hover:bg-gray-50 disabled:opacity-60">
                {savingIntent === "draft" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save draft
              </button>}
              <span className="text-xs text-gray-400">{editingPublished ? "The client sees the update immediately; the original handover record and public link remain intact." : "Save your progress and come back to it later."}</span>
            </div>
          </div>
        </section>
      )}

      {drafts.length > 0 && (data?.capabilities.create || data?.capabilities.send) && (
        <section className="mb-7 rounded-2xl border border-blue-100 bg-blue-50/40 p-5 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-base font-bold text-[#07133B]"><Save className="h-4 w-4 text-[#0A4FE8]" /> Saved drafts</h2>
            <span className="text-xs font-semibold text-[#0A4FE8]">{drafts.length} in progress</span>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {drafts.map((draft) => (
              <div key={draft.id} className={`flex flex-col gap-3 rounded-xl border bg-white p-4 shadow-sm ${draftId === draft.id ? "border-[#0A4FE8] ring-1 ring-blue-200" : "border-blue-100"}`}>
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold text-[#07133B]">{draft.title || "Untitled draft"}</p>
                  <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-gray-500">
                    <span className="inline-flex items-center gap-1"><UserRoundCheck className="h-3 w-3" /> {draft.client_name || "No client yet"}</span>
                    <span className="inline-flex items-center gap-1"><FileText className="h-3 w-3" /> {draft.file_count} file{draft.file_count === 1 ? "" : "s"}</span>
                    <span className="rounded bg-violet-50 px-1.5 py-0.5 font-semibold text-violet-700">{draft.delivery_type === "brand_identity" ? "Brand" : "Design"}</span>
                  </div>
                </div>
                <div className="grid grid-cols-[1fr_auto] gap-2">
                  <button type="button" onClick={() => startEditingDraft(draft)} className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-[#0A4FE8] px-3 py-2 text-xs font-bold text-white hover:bg-blue-700">
                    <Pencil className="h-3.5 w-3.5" /> Continue
                  </button>
                  {data?.capabilities.deleteDraft && (
                    <button type="button" disabled={deletingDraftId === draft.id} onClick={() => void deleteDraft(draft)} className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-rose-200 bg-white px-3 py-2 text-xs font-bold text-rose-600 hover:bg-rose-50 disabled:opacity-50" aria-label={`Delete ${draft.title}`}>
                      {deletingDraftId === draft.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                      <span className="hidden sm:inline">Delete</span>
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <section>
        <div className="mb-4 flex items-center justify-between"><h2 className="text-base font-bold text-[#07133B]">Delivery history</h2><span className="text-xs text-gray-400">{historyDeliveries.length} records</span></div>
        {loading ? (
          <div className="grid min-h-52 place-items-center rounded-2xl border border-gray-100 bg-white"><Loader2 className="h-6 w-6 animate-spin text-[#0A4FE8]" /></div>
        ) : historyDeliveries.length === 0 ? (
          <div className="grid min-h-52 place-items-center rounded-2xl border border-gray-100 bg-white px-6 text-center"><div><FolderKanban className="mx-auto mb-3 h-9 w-9 text-blue-200" /><p className="font-semibold text-[#07133B]">No client handovers yet</p><p className="mt-1 text-sm text-gray-500">Send the first finished project files above.</p></div></div>
        ) : (
          <div className="space-y-4">
            {historyDeliveries.map((delivery) => (
              <article key={delivery.id} className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0 flex-1">
                    {delivery.cover_version && (
                      <div className="mb-4 aspect-[1200/630] w-full max-w-[240px] overflow-hidden rounded-xl border border-gray-200 bg-[#F8FAFD]">
                        <img
                          src={`/api/admin/clients/deliveries/${delivery.id}/cover?v=${delivery.cover_version}`}
                          alt={`${delivery.title} cover`}
                          loading="lazy"
                          className="h-full w-full object-cover"
                        />
                      </div>
                    )}
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ${statusStyles[delivery.status] || statusStyles.draft}`}>{deliveryStatusLabel(delivery.status)}</span>
                      <span className="rounded-full bg-violet-50 px-2.5 py-1 text-[10px] font-semibold text-violet-700">{delivery.delivery_type === "brand_identity" ? "Brand identity" : "Design"}</span>
                      {delivery.delivery_group_id && <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2.5 py-1 text-[10px] font-semibold text-[#0A4FE8]"><Users className="h-3 w-3" /> Multi-client</span>}
                    </div>
                    <h3 className="mt-3 text-lg font-bold text-[#07133B]">{delivery.title}</h3>
                    {delivery.description && <p className="mt-1 max-w-3xl text-sm leading-relaxed text-gray-500">{delivery.description}</p>}
                    <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-xs text-gray-500">
                      <span className="inline-flex items-center gap-1.5"><UserRoundCheck className="h-3.5 w-3.5" /> {delivery.client_name || "No client yet"}</span>
                      {delivery.project_name && <span className="inline-flex items-center gap-1.5"><FolderKanban className="h-3.5 w-3.5" /> {delivery.project_name}</span>}
                      <span className="inline-flex items-center gap-1.5"><FileText className="h-3.5 w-3.5" /> {delivery.file_count} file{delivery.file_count === 1 ? "" : "s"}</span>
                      {delivery.external_url && <a href={delivery.external_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 font-semibold text-[#0A4FE8]"><Link2 className="h-3.5 w-3.5" /> Google link</a>}
                    </div>
                    {delivery.file_names?.length > 0 && <p className="mt-2 line-clamp-1 text-[11px] text-gray-400">{delivery.file_names.join(" · ")}</p>}
                  </div>
                  {delivery.status === "published" || delivery.status === "awaiting_account" ? (
                    <div className="flex max-w-xl flex-wrap items-center justify-end gap-2">
                      {delivery.status === "published" ? (
                        <div className="inline-flex items-center gap-2 rounded-xl bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700"><CheckCircle2 className="h-4 w-4" /> Available in the client account</div>
                      ) : (
                        <Link href="/admin/clients/list" className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800 hover:bg-amber-100"><CircleAlert className="h-4 w-4" /> Invite or merge client account</Link>
                      )}
                      {data?.capabilities.editPublished && (
                        <button type="button" onClick={() => startEditingPublished(delivery)} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-blue-100 bg-white px-3 py-2 text-xs font-bold text-[#0A4FE8] hover:bg-blue-50">
                          <Pencil className="h-4 w-4" /> Edit
                        </button>
                      )}
                      {data?.capabilities.archive && (
                        <button type="button" disabled={changingArchiveId === delivery.id} onClick={() => void changeArchiveState(delivery, "archive")} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-50">
                          {changingArchiveId === delivery.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Archive className="h-4 w-4" />} Archive
                        </button>
                      )}
                      <Link href={absolutePublicUrl(publicDeliveryPath(delivery.title, delivery.public_token))} target="_blank" rel="noreferrer" className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-blue-100 bg-white px-3 py-2 text-xs font-bold text-[#0A4FE8] hover:bg-blue-50">
                        <ExternalLink className="h-4 w-4" /> Public view
                      </Link>
                      <UniversalShareButton
                        title={delivery.title}
                        text={`View ${delivery.title}, a completed delivery from CDS Space.`}
                        url={publicDeliveryPath(delivery.title, delivery.public_token)}
                        clientTarget={delivery.client_user_id ? { id: delivery.client_user_id, name: delivery.client_name || "Client" } : null}
                      />
                    </div>
                  ) : (
                    <div className="flex w-full max-w-md gap-2 rounded-xl border border-blue-100 bg-blue-50/50 p-3 lg:w-[390px]">
                      <select value={deliveryRecipients[delivery.id] || ""} onChange={(event) => setDeliveryRecipients((current) => ({ ...current, [delivery.id]: event.target.value }))} className="h-10 min-w-0 flex-1 rounded-lg border border-blue-100 bg-white px-2 text-xs outline-none">
                        <option value="">Choose receiving client</option>
                        {(data?.clients || []).map((client) => <option key={client.id} value={clientReference(client)}>{clientName(client)}</option>)}
                      </select>
                      {data?.capabilities.send && <button type="button" disabled={sendingExisting || !deliveryRecipients[delivery.id]} onClick={() => void sendExistingDelivery(delivery)} className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-[#0A4FE8] px-3 text-xs font-bold text-white disabled:opacity-50"><Send className="h-3.5 w-3.5" /> {delivery.status === "submitted" ? "Approve and deliver" : "Send"}</button>}
                    </div>
                  )}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      {archivedDeliveries.length > 0 && (
        <section className="mt-8 rounded-2xl border border-slate-200 bg-slate-50/70 p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 className="flex items-center gap-2 text-base font-bold text-[#07133B]"><Archive className="h-4 w-4 text-slate-500" /> Archived deliveries</h2>
              <p className="mt-1 text-xs text-slate-500">Preserved for audit, hidden from the client account, and inaccessible through the public link.</p>
            </div>
            <span className="text-xs text-slate-400">{archivedDeliveries.length} archived</span>
          </div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {archivedDeliveries.map((delivery) => (
              <article key={delivery.id} className="rounded-xl border border-slate-200 bg-white p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-[#07133B]">{delivery.title}</p>
                    <p className="mt-1 text-[11px] text-slate-500">{delivery.client_name || "Client"} · {delivery.file_count} file{delivery.file_count === 1 ? "" : "s"}</p>
                  </div>
                  {data?.capabilities.archive && (
                    <button type="button" disabled={changingArchiveId === delivery.id} onClick={() => void changeArchiveState(delivery, "restore")} className="inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-lg border border-blue-100 px-3 text-[11px] font-bold text-[#0A4FE8] hover:bg-blue-50 disabled:opacity-50">
                      {changingArchiveId === delivery.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />} Restore
                    </button>
                  )}
                </div>
              </article>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
