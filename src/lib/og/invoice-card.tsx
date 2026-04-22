import type { ReactElement } from "react";

export interface InvoiceCardProps {
  invoiceNumber: string;
  clientName: string;
  status: "draft" | "sent" | "paid" | "overdue" | "cancelled";
  issueDate: string;
  dueDate?: string | null;
  total: number;
  currency: string;
}

const STATUS_STYLES: Record<InvoiceCardProps["status"], { bg: string; border: string; text: string; label: string }> = {
  draft:     { bg: "rgba(148,163,184,0.22)", border: "rgba(203,213,225,0.5)",  text: "#e2e8f0", label: "DRAFT" },
  sent:      { bg: "rgba(59,130,246,0.22)",  border: "rgba(147,197,253,0.6)",  text: "#dbeafe", label: "SENT" },
  paid:      { bg: "rgba(16,185,129,0.25)",  border: "rgba(134,239,172,0.7)",  text: "#d1fae5", label: "PAID" },
  overdue:   { bg: "rgba(239,68,68,0.25)",   border: "rgba(252,165,165,0.7)",  text: "#fecaca", label: "OVERDUE" },
  cancelled: { bg: "rgba(100,116,139,0.25)", border: "rgba(203,213,225,0.5)",  text: "#cbd5e1", label: "CANCELLED" },
};

const CURRENCY_SYMBOLS: Record<string, string> = { NGN: "₦", USD: "$", RWF: "FRw " };

function formatMoney(total: number, currency: string) {
  const symbol = CURRENCY_SYMBOLS[currency] ?? "";
  return `${symbol}${Number(total || 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatDate(iso: string | null | undefined) {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
  } catch {
    return iso;
  }
}

export function renderInvoiceCard(p: InvoiceCardProps): ReactElement {
  const status = STATUS_STYLES[p.status] ?? STATUS_STYLES.sent;

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        position: "relative",
        background: "linear-gradient(135deg, #040b37 0%, #081149 55%, #0a1a6b 100%)",
        color: "#ffffff",
        fontFamily: "Inter, system-ui, -apple-system, sans-serif",
        padding: "64px 72px",
        overflow: "hidden",
      }}
    >
      {/* Starlight glows */}
      <div
        style={{
          position: "absolute",
          top: -260,
          right: -180,
          width: 760,
          height: 760,
          borderRadius: "50%",
          background:
            "radial-gradient(circle at center, #3f7dffcc 0%, #3f7dff55 35%, transparent 70%)",
          filter: "blur(20px)",
          display: "flex",
        }}
      />
      <div
        style={{
          position: "absolute",
          bottom: -200,
          left: -140,
          width: 520,
          height: 520,
          borderRadius: "50%",
          background:
            "radial-gradient(circle at center, #5ba8ff33 0%, transparent 70%)",
          filter: "blur(30px)",
          display: "flex",
        }}
      />

      {/* Logo row */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", zIndex: 2 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: 12,
              background: "linear-gradient(135deg, #5ba8ff 0%, #0a4fe8 60%, #0035c1 100%)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontWeight: 800,
              fontSize: 22,
              boxShadow: "0 8px 24px rgba(10,79,232,0.45)",
            }}
          >
            C
          </div>
          <div
            style={{
              fontSize: 24,
              fontWeight: 700,
              letterSpacing: 1.5,
              display: "flex",
            }}
          >
            CDS SPACE
          </div>
        </div>
        <div
          style={{
            padding: "10px 20px",
            borderRadius: 999,
            background: status.bg,
            border: `1px solid ${status.border}`,
            color: status.text,
            fontSize: 18,
            fontWeight: 700,
            letterSpacing: 3,
            display: "flex",
          }}
        >
          {status.label}
        </div>
      </div>

      {/* Spacer */}
      <div style={{ flex: 1, display: "flex" }} />

      {/* Main */}
      <div style={{ display: "flex", flexDirection: "column", zIndex: 2 }}>
        <div
          style={{
            fontSize: 18,
            fontWeight: 600,
            letterSpacing: 3,
            textTransform: "uppercase",
            color: "#7fb5ff",
            marginBottom: 14,
            display: "flex",
          }}
        >
          Invoice
        </div>
        <div
          style={{
            fontSize: 80,
            fontWeight: 800,
            lineHeight: 1,
            letterSpacing: -2,
            color: "#ffffff",
            display: "flex",
          }}
        >
          {p.invoiceNumber}
        </div>
        <div
          style={{
            fontSize: 34,
            fontWeight: 600,
            lineHeight: 1.2,
            color: "#dbeaff",
            marginTop: 18,
            display: "flex",
          }}
        >
          {p.clientName}
        </div>
      </div>

      {/* Stats row */}
      <div
        style={{
          marginTop: 36,
          display: "flex",
          alignItems: "flex-end",
          justifyContent: "space-between",
          gap: 30,
          zIndex: 2,
        }}
      >
        <div style={{ display: "flex", gap: 40 }}>
          <Stat label="ISSUED" value={formatDate(p.issueDate)} />
          <Stat label="DUE" value={formatDate(p.dueDate)} />
          <Stat label="TOTAL" value={formatMoney(p.total, p.currency)} strong />
        </div>
        <div
          style={{
            fontSize: 15,
            color: "#9fb8ff",
            fontWeight: 500,
            display: "flex",
          }}
        >
          cdsspace.pro · invoice
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      <div
        style={{
          fontSize: 13,
          letterSpacing: 2.5,
          color: "#8ea5da",
          fontWeight: 600,
          marginBottom: 6,
          display: "flex",
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: strong ? 30 : 24,
          fontWeight: strong ? 800 : 600,
          color: "#ffffff",
          display: "flex",
        }}
      >
        {value}
      </div>
    </div>
  );
}
