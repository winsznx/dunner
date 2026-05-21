export const metadata = {
  title: "Contact · Dunner",
  description: "Get in touch with Dunner — support, sales, press, security.",
};

const CHANNELS = [
  {
    label: "General & sales",
    email: "hello@dunner.xyz",
    note: "Pricing, demos, integration questions.",
  },
  {
    label: "Support",
    email: "support@dunner.xyz",
    note: "Account help, billing, recovery quality. We aim to respond within one business day.",
  },
  {
    label: "Security",
    email: "security@dunner.xyz",
    note: "Vulnerability reports and security disclosures.",
  },
];

const SOCIALS = [
  { name: "X (Twitter)", href: "https://x.com/dunner_app", handle: "@dunner_app" },
  { name: "LinkedIn", href: "https://www.linkedin.com/company/dunner", handle: "/company/dunner" },
  { name: "Instagram", href: "https://www.instagram.com/dunner_app", handle: "@dunner_app" },
  { name: "TikTok", href: "https://www.tiktok.com/@dunner_app", handle: "@dunner_app" },
];

export default function ContactPage() {
  return (
    <article className="text-[#EEEEEF]">
      <p className="font-mono text-xs tracking-[0.2em] text-[#6C6C74] uppercase mb-4">
        Get in touch
      </p>
      <h1 className="text-4xl md:text-5xl font-bold tracking-tight leading-tight mb-6">
        Contact us.
      </h1>
      <p className="text-[#A0A0AB] text-lg leading-relaxed mb-12 max-w-2xl">
        We&apos;re a small team. Emails get answered fast. Pick the
        channel that fits your need and we&apos;ll be back to you.
      </p>

      <div className="grid md:grid-cols-3 gap-4 mb-16">
        {CHANNELS.map((c) => (
          <div
            key={c.email}
            className="bg-[#1A1A1E] border border-[#2A2A2F] rounded-2xl p-6 flex flex-col gap-3"
          >
            <span className="text-[10px] uppercase tracking-widest text-[#6C6C74] font-medium">
              {c.label}
            </span>
            <a
              href={`mailto:${c.email}`}
              className="text-[#EEEEEF] font-mono text-base hover:text-[#22D3EE] transition-colors break-all"
            >
              {c.email}
            </a>
            <p className="text-[#A0A0AB] text-sm leading-relaxed">{c.note}</p>
          </div>
        ))}
      </div>

      <div className="border-t border-[#2A2A2F] pt-12">
        <h2 className="text-xl font-semibold text-[#EEEEEF] mb-6">
          Follow along
        </h2>
        <ul className="flex flex-col gap-3 max-w-md">
          {SOCIALS.map((s) => (
            <li key={s.href}>
              <a
                href={s.href}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-between py-3 px-4 rounded-lg bg-[#1A1A1E] border border-transparent hover:border-[#2A2A2F] transition-colors group"
              >
                <span className="text-[#EEEEEF] text-sm">{s.name}</span>
                <span className="text-[#6C6C74] text-sm font-mono group-hover:text-[#EEEEEF]">
                  {s.handle}
                </span>
              </a>
            </li>
          ))}
        </ul>
      </div>
    </article>
  );
}
