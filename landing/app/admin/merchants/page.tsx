import { adminFetch } from "@/lib/admin";

type Merchant = {
  id: string;
  name: string;
  email: string | null;
  stripeAccountId: string | null;
  stripeAccountStatus: string | null;
  defaultVoiceId: string | null;
  agentId: string | null;
  applicationFeePercent: number;
  createdAt: string;
};

function readyState(m: Merchant): string {
  const bits = [
    m.stripeAccountId ? "stripe" : null,
    m.defaultVoiceId && m.defaultVoiceId !== "__SKIP__" ? "voice" : null,
    m.agentId ? "agent" : null,
  ].filter(Boolean);
  return bits.length === 3 ? "ready" : `${bits.length}/3`;
}

export default async function AdminMerchants() {
  const { items } = await adminFetch<{ items: Merchant[] }>("/admin/merchants");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight">Merchants</h1>
        <p className="text-[#A0A0AB] text-sm mt-1">{items.length} accounts.</p>
      </div>

      <div className="bg-[#1A1A1E] border border-[#2A2A2F] rounded-2xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-[#0F0F11] border-b border-[#2A2A2F]">
            <tr className="text-left text-[10px] uppercase tracking-widest text-[#6C6C74]">
              <th className="px-5 py-3 font-medium">Name</th>
              <th className="px-5 py-3 font-medium">Email</th>
              <th className="px-5 py-3 font-medium">Stripe</th>
              <th className="px-5 py-3 font-medium">Onboarded</th>
              <th className="px-5 py-3 font-medium">Fee</th>
              <th className="px-5 py-3 font-medium">Joined</th>
            </tr>
          </thead>
          <tbody>
            {items.map((m) => (
              <tr key={m.id} className="border-b border-[#2A2A2F] last:border-0">
                <td className="px-5 py-3">{m.name}</td>
                <td className="px-5 py-3 text-xs text-[#A0A0AB]">
                  {m.email ?? "—"}
                </td>
                <td className="px-5 py-3 font-mono text-xs text-[#A0A0AB]">
                  {m.stripeAccountId
                    ? `${m.stripeAccountId.slice(0, 12)}…`
                    : "—"}
                </td>
                <td className="px-5 py-3">
                  <span
                    className={`text-[10px] uppercase tracking-widest px-2 py-1 rounded-full font-medium ${
                      readyState(m) === "ready"
                        ? "bg-[#10B981]/15 text-[#10B981]"
                        : "bg-[#22D3EE]/10 text-[#22D3EE]"
                    }`}
                  >
                    {readyState(m)}
                  </span>
                </td>
                <td className="px-5 py-3 text-xs text-[#A0A0AB] font-mono">
                  {m.applicationFeePercent}%
                </td>
                <td className="px-5 py-3 text-xs text-[#A0A0AB]">
                  {new Date(m.createdAt).toLocaleDateString()}
                </td>
              </tr>
            ))}
            {items.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-5 py-12 text-center text-[#6C6C74]">
                  No merchants yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
