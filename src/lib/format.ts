const ZERO_DECIMAL_CURRENCIES = new Set([
  "BIF",
  "CLP",
  "DJF",
  "GNF",
  "JPY",
  "KMF",
  "KRW",
  "MGA",
  "PYG",
  "RWF",
  "UGX",
  "VND",
  "VUV",
  "XAF",
  "XOF",
  "XPF",
]);

export function formatAmount(minorUnits: number, currency: string): string {
  const upper = currency.toUpperCase();
  const value = ZERO_DECIMAL_CURRENCIES.has(upper)
    ? minorUnits
    : minorUnits / 100;
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: upper,
    }).format(value);
  } catch {
    return `${value} ${upper}`;
  }
}

export function formatRelative(date: Date | string | null): string {
  if (!date) return "—";
  const d = typeof date === "string" ? new Date(date) : date;
  const diffMs = Date.now() - d.getTime();
  const secs = Math.round(diffMs / 1000);
  if (secs < 60) return "just now";
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function formatDuration(secs: number | null): string {
  if (secs == null) return "—";
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export type StateBadge = {
  label: string;
  bgClass: string;
  fgClass: string;
  pulse?: boolean;
};

export function badgeFor(state: string): StateBadge {
  switch (state) {
    case "QUEUED":
      return {
        label: "Queued",
        bgClass: "bg-bg-elevated",
        fgClass: "text-ink-secondary",
      };
    case "SCHEDULED":
      return {
        label: "Scheduled",
        bgClass: "bg-bg-elevated",
        fgClass: "text-ink-secondary",
      };
    case "READY_TO_CALL":
      return {
        label: "Calling soon",
        bgClass: "bg-accent-neutral/20",
        fgClass: "text-accent-neutral",
      };
    case "CALLING":
    case "IN_CALL":
      return {
        label: "In call",
        bgClass: "bg-accent-recovery",
        fgClass: "text-white",
        pulse: true,
      };
    case "RECOVERED_PENDING":
      return {
        label: "Recovering",
        bgClass: "bg-accent-neutral/20",
        fgClass: "text-accent-neutral",
      };
    case "RECOVERED":
      return {
        label: "Recovered",
        bgClass: "bg-accent-recovery",
        fgClass: "text-white",
      };
    case "RETRY_QUEUED":
    case "FAILED_NEEDS_RETRY":
      return {
        label: "Retrying",
        bgClass: "bg-bg-elevated",
        fgClass: "text-ink-secondary",
      };
    case "CHURNED":
      return {
        label: "Churned",
        bgClass: "bg-accent-failure/20",
        fgClass: "text-accent-failure",
      };
    case "ABANDONED":
      return {
        label: "Couldn't reach",
        bgClass: "bg-bg-elevated",
        fgClass: "text-ink-muted",
      };
    case "ABUSE_TERMINATED":
      return {
        label: "Ended",
        bgClass: "bg-bg-elevated",
        fgClass: "text-ink-muted",
      };
    default:
      return {
        label: state,
        bgClass: "bg-bg-elevated",
        fgClass: "text-ink-secondary",
      };
  }
}
