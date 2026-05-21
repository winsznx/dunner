import { revalidatePath } from "next/cache";
import { adminFetch } from "@/lib/admin";

type Row = {
  id: string;
  email: string;
  status: string;
  accessCode: string | null;
  source: string | null;
  invitedAt: string | null;
  redeemedAt: string | null;
  createdAt: string;
};

async function invite(formData: FormData) {
  "use server";
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await adminFetch("/admin/waitlist/invite", {
    method: "POST",
    body: JSON.stringify({ id }),
  });
  revalidatePath("/admin/waitlist");
}

async function unsub(formData: FormData) {
  "use server";
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await adminFetch("/admin/waitlist/unsub", {
    method: "POST",
    body: JSON.stringify({ id }),
  });
  revalidatePath("/admin/waitlist");
}

function relative(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  const ms = Date.now() - d.getTime();
  const mins = Math.round(ms / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 48) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

const STATUS_TONE: Record<string, string> = {
  pending: "bg-[#242428] text-[#A0A0AB]",
  invited: "bg-[#22D3EE]/15 text-[#22D3EE]",
  redeemed: "bg-[#10B981]/15 text-[#10B981]",
  unsubscribed: "bg-[#6C6C74]/20 text-[#6C6C74]",
};

export default async function AdminWaitlist() {
  const { items } = await adminFetch<{ items: Row[] }>("/admin/waitlist");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight">Waitlist</h1>
        <p className="text-[#A0A0AB] text-sm mt-1">
          {items.length} subscribers · click invite to email an access code.
        </p>
      </div>

      <div className="bg-[#1A1A1E] border border-[#2A2A2F] rounded-2xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-[#0F0F11] border-b border-[#2A2A2F]">
            <tr className="text-left text-[10px] uppercase tracking-widest text-[#6C6C74]">
              <th className="px-5 py-3 font-medium">Email</th>
              <th className="px-5 py-3 font-medium">Status</th>
              <th className="px-5 py-3 font-medium">Code</th>
              <th className="px-5 py-3 font-medium">Source</th>
              <th className="px-5 py-3 font-medium">Joined</th>
              <th className="px-5 py-3 font-medium">Invited</th>
              <th className="px-5 py-3 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {items.map((row) => (
              <tr key={row.id} className="border-b border-[#2A2A2F] last:border-0">
                <td className="px-5 py-3 text-[#EEEEEF]">{row.email}</td>
                <td className="px-5 py-3">
                  <span
                    className={`text-[10px] uppercase tracking-widest px-2 py-1 rounded-full font-medium ${
                      STATUS_TONE[row.status] ?? STATUS_TONE.pending
                    }`}
                  >
                    {row.status}
                  </span>
                </td>
                <td className="px-5 py-3 font-mono text-xs text-[#A0A0AB]">
                  {row.accessCode ?? "—"}
                </td>
                <td className="px-5 py-3 text-xs text-[#A0A0AB]">
                  {row.source ?? "—"}
                </td>
                <td className="px-5 py-3 text-xs text-[#A0A0AB]">
                  {relative(row.createdAt)}
                </td>
                <td className="px-5 py-3 text-xs text-[#A0A0AB]">
                  {relative(row.invitedAt)}
                </td>
                <td className="px-5 py-3 text-right">
                  <div className="flex items-center justify-end gap-2">
                    {row.status !== "redeemed" && row.status !== "unsubscribed" ? (
                      <form action={invite}>
                        <input type="hidden" name="id" value={row.id} />
                        <button
                          type="submit"
                          className="text-xs px-3 py-1.5 rounded-full bg-[#22D3EE]/15 text-[#22D3EE] hover:bg-[#22D3EE]/25 transition"
                        >
                          {row.status === "invited" ? "Resend" : "Invite"}
                        </button>
                      </form>
                    ) : null}
                    {row.status !== "unsubscribed" ? (
                      <form action={unsub}>
                        <input type="hidden" name="id" value={row.id} />
                        <button
                          type="submit"
                          className="text-xs px-3 py-1.5 rounded-full bg-[#1F1F23] text-[#A0A0AB] hover:text-white transition"
                        >
                          Remove
                        </button>
                      </form>
                    ) : null}
                  </div>
                </td>
              </tr>
            ))}
            {items.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-5 py-12 text-center text-[#6C6C74]">
                  No signups yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
