import { adminFetch } from "@/lib/admin";

type Recovery = {
  id: string;
  merchantId: string;
  state: string;
  attempts: number;
  recoveredAmount: number | null;
  applicationFeeCollected: number | null;
  finalOutcome: string | null;
  createdAt: string;
  updatedAt: string;
  customerName: string | null;
  customerEmail: string | null;
  amountDue: number;
  currency: string;
  planName: string | null;
  merchantName: string | null;
};

function formatAmount(cents: number | null, currency: string): string {
  if (cents == null) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: (currency || "USD").toUpperCase(),
  }).format(cents / 100);
}

const STATE_TONE: Record<string, string> = {
  RECOVERED: "bg-[#10B981]/15 text-[#10B981]",
  RECOVERED_PENDING: "bg-[#10B981]/10 text-[#10B981]",
  CALLING: "bg-[#22D3EE]/15 text-[#22D3EE]",
  IN_CALL: "bg-[#22D3EE]/15 text-[#22D3EE]",
  SCHEDULED: "bg-[#FBBF24]/15 text-[#FBBF24]",
  RETRY_QUEUED: "bg-[#FBBF24]/10 text-[#FBBF24]",
  CHURNED: "bg-[#EF4444]/15 text-[#EF4444]",
  ABANDONED: "bg-[#6C6C74]/20 text-[#6C6C74]",
  ABUSE_TERMINATED: "bg-[#EF4444]/20 text-[#EF4444]",
  QUEUED: "bg-[#242428] text-[#A0A0AB]",
};

export default async function AdminRecoveries() {
  const { items } = await adminFetch<{ items: Recovery[] }>("/admin/recoveries");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight">Recoveries</h1>
        <p className="text-[#A0A0AB] text-sm mt-1">
          {items.length} across all merchants.
        </p>
      </div>

      <div className="bg-[#1A1A1E] border border-[#2A2A2F] rounded-2xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-[#0F0F11] border-b border-[#2A2A2F]">
            <tr className="text-left text-[10px] uppercase tracking-widest text-[#6C6C74]">
              <th className="px-5 py-3 font-medium">Merchant</th>
              <th className="px-5 py-3 font-medium">Customer</th>
              <th className="px-5 py-3 font-medium">Plan</th>
              <th className="px-5 py-3 font-medium">Amount</th>
              <th className="px-5 py-3 font-medium">Recovered</th>
              <th className="px-5 py-3 font-medium">Fee</th>
              <th className="px-5 py-3 font-medium">State</th>
              <th className="px-5 py-3 font-medium">Updated</th>
            </tr>
          </thead>
          <tbody>
            {items.map((r) => (
              <tr key={r.id} className="border-b border-[#2A2A2F] last:border-0">
                <td className="px-5 py-3">{r.merchantName ?? "—"}</td>
                <td className="px-5 py-3 text-[#EEEEEF]">
                  {r.customerName ?? "—"}
                </td>
                <td className="px-5 py-3 text-xs text-[#A0A0AB]">
                  {r.planName ?? "—"}
                </td>
                <td className="px-5 py-3 font-mono tabular-nums">
                  {formatAmount(r.amountDue, r.currency)}
                </td>
                <td className="px-5 py-3 font-mono tabular-nums text-[#10B981]">
                  {formatAmount(r.recoveredAmount, r.currency)}
                </td>
                <td className="px-5 py-3 font-mono tabular-nums text-xs text-[#A0A0AB]">
                  {formatAmount(r.applicationFeeCollected, r.currency)}
                </td>
                <td className="px-5 py-3">
                  <span
                    className={`text-[10px] uppercase tracking-widest px-2 py-1 rounded-full font-medium ${
                      STATE_TONE[r.state] ?? STATE_TONE.QUEUED
                    }`}
                  >
                    {r.state.replace(/_/g, " ").toLowerCase()}
                  </span>
                </td>
                <td className="px-5 py-3 text-xs text-[#A0A0AB]">
                  {new Date(r.updatedAt).toLocaleString()}
                </td>
              </tr>
            ))}
            {items.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-5 py-12 text-center text-[#6C6C74]">
                  No recoveries yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
