export interface ActivityDetail {
  label: string;
  value: string;
}

function text(value: unknown) {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return "";
}

function namesFromArray(value: unknown, key: "name" | "relative_path") {
  if (!Array.isArray(value)) return "";
  return value
    .map((item) => item && typeof item === "object" ? text((item as Record<string, unknown>)[key]) : text(item))
    .filter(Boolean)
    .join(", ");
}

/** Human-readable, deliberately allow-listed audit metadata for admin screens. */
export function activityDetailRows(metadata: Record<string, unknown> | null | undefined): ActivityDetail[] {
  if (!metadata) return [];
  const rows: ActivityDetail[] = [];
  const add = (label: string, value: unknown) => {
    const rendered = text(value);
    if (rendered && !rows.some((row) => row.label === label && row.value === rendered)) {
      rows.push({ label, value: rendered });
    }
  };

  add("Where", metadata.destination);
  add("Client", metadata.recipient);
  const recipients = namesFromArray(metadata.recipients, "name");
  if (recipients) add("Clients", recipients);
  add("Project", metadata.project_name || metadata.project_id);
  add("Files", metadata.file_count || metadata.added_file_count);
  const files = namesFromArray(metadata.files, "relative_path") || namesFromArray(metadata.files, "name");
  if (files) add("Uploaded", files);
  add("Approved by", metadata.approved_by);
  add("Approved on", metadata.approved_on);
  add("Reason", metadata.reason);
  add("Changed fields", metadata.changed_fields);
  add("Previous salary", metadata.previous_salary);
  add("New salary", metadata.new_salary);
  add("Target start", metadata.target_start);
  add("Status", metadata.status);
  add("Priority", metadata.priority);
  add("Forecast", metadata.forecast);
  add("Sent by", metadata.sent_by);
  add("Device", metadata.device_name || metadata.system_name || metadata.device_type);
  add("Browser", metadata.browser_name);
  add("Operating system", metadata.os_name);
  add("Location", metadata.location);
  add("IP address", metadata.ip_address);
  add("Timezone", metadata.timezone);
  add("Login source", metadata.source);
  add("Previous sessions closed", metadata.replaced_session_count);
  return rows;
}

export function activityMetadataSummary(metadata: Record<string, unknown> | null | undefined) {
  return activityDetailRows(metadata).map((row) => `${row.label}: ${row.value}`).join(" · ");
}
