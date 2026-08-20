interface ChatSidebarPreviewProps {
  text?: string | null;
  fallback?: string;
  className?: string;
}

/**
 * Shared compact preview for every chat/conversation list.
 *
 * Inline layout constraints are intentional: dashboard-level mobile and
 * accessibility styles can change button wrapping, but a message preview must
 * always remain one line so one long message cannot stretch the sidebar row.
 */
export function ChatSidebarPreview({
  text,
  fallback = "No messages yet",
  className = "",
}: ChatSidebarPreviewProps) {
  const preview = (text?.trim() || fallback).replace(/\s+/g, " ");

  return (
    <p
      data-chat-preview
      className={className}
      title={preview}
      style={{
        display: "block",
        inlineSize: "100%",
        minInlineSize: 0,
        maxInlineSize: "100%",
        overflow: "hidden",
        overflowWrap: "normal",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
      }}
    >
      {preview}
    </p>
  );
}
