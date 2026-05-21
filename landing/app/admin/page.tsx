import { adminFetch } from "@/lib/admin";

type Overview = {
  merchants: number;
  waitlistTotal: number;
  waitlistNew7d: number;
  recoveriesTotal: number;
  recoveriesRecovered: number;
  totalRecoveredAmountCents: number;
  totalFeeAmountCents: number;
};

function formatUsd(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(cents / 100);
}

export default async function AdminOverview() {
  const data = await adminFetch<Overview>("/admin/overview");
  const recoveryRate =
    data.recoveriesTotal > 0
      ? ((data.recoveriesRecovered / data.recoveriesTotal) * 100).toFixed(1)
      : "—";

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight">Overview</h1>
        <p className="text-[#A0A0AB] text-sm mt-1">Live state of Dunner.</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Kpi label="Merchants" value={String(data.merchants)} />
        <Kpi
          label="Waitlist"
          value={String(data.waitlistTotal)}
          sub={`${data.waitlistNew7d} this week`}
        />
        <Kpi
          label="Recoveries"
          value={String(data.recoveriesTotal)}
          sub={`${recoveryRate}% success`}
        />
        <Kpi
          label="Recovered (gross)"
          value={formatUsd(data.totalRecoveredAmountCents)}
          sub={`fee earned ${formatUsd(data.totalFeeAmountCents)}`}
        />
      </div>
    </div>
  );
}

function Kpi({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="bg-[#1A1A1E] border border-[#2A2A2F] rounded-2xl p-5">
      <div className="text-[10px] uppercase tracking-widest text-[#6C6C74] font-medium">
        {label}
      </div>
      <div className="text-2xl mt-2 font-mono font-semibold tabular-nums">
        {value}
      </div>
      {sub ? <div className="text-xs text-[#A0A0AB] mt-2">{sub}</div> : null}
    </div>
  );
}
