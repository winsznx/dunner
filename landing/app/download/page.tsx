import Image from "next/image";
import Link from "next/link";
import { LOGO_SRC } from "@/lib/brand";

export const metadata = {
  title: "Download · Dunner",
  description: "Install the Dunner app on iOS or Android.",
};

export default function DownloadPage() {
  return (
    <div className="min-h-screen bg-[#0F0F11] text-[#EEEEEF] flex flex-col">
      <header className="px-6 py-6">
        <Link href="/" className="inline-flex items-center">
          <Image
            src={LOGO_SRC}
            alt="Dunner"
            width={432}
            height={86}
            style={{ height: "28px", width: "auto" }}
            priority
          />
        </Link>
      </header>

      <main className="flex-1 px-6 py-12 md:py-24">
        <div className="max-w-2xl mx-auto">
          <p className="font-mono text-xs tracking-[0.2em] text-[#6C6C74] uppercase mb-4">
            Get the app
          </p>
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight leading-tight mb-6">
            Install Dunner.
          </h1>
          <p className="text-[#A0A0AB] text-lg leading-relaxed mb-12">
            Open the install link below for your phone, then sign in with the
            6-character access code from your invite email.
          </p>

          <div className="grid md:grid-cols-2 gap-4 mb-12">
            <PlatformCard
              platform="iOS"
              status="invite-only"
              note="TestFlight invite is sent manually for the first cohort. Reply to your invite email with your Apple ID to be added."
              cta={null}
            />
            <PlatformCard
              platform="Android"
              status="coming soon"
              note="The Android APK ships this week. We'll email you the install link the moment it's ready."
              cta={null}
            />
          </div>

          <div className="bg-[#1A1A1E] border border-[#2A2A2F] rounded-2xl p-6">
            <p className="text-[10px] uppercase tracking-widest text-[#6C6C74] font-medium mb-3">
              Your access code
            </p>
            <p className="text-[#EEEEEF] text-sm leading-relaxed">
              The 6-character code in your invite email gates the first
              sign-in. It binds to your email, so don&rsquo;t share it. If you
              didn&rsquo;t get an email,{" "}
              <a
                href="mailto:hello@dunner.xyz"
                className="text-[#22D3EE] hover:underline"
              >
                ping us
              </a>
              .
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}

function PlatformCard({
  platform,
  status,
  note,
  cta,
}: {
  platform: string;
  status: string;
  note: string;
  cta: { label: string; href: string } | null;
}) {
  return (
    <div className="bg-[#1A1A1E] border border-[#2A2A2F] rounded-2xl p-6 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-[#EEEEEF] text-lg font-semibold">{platform}</span>
        <span className="text-[10px] uppercase tracking-widest px-2 py-1 rounded-full bg-[#FBBF24]/15 text-[#FBBF24] font-medium">
          {status}
        </span>
      </div>
      <p className="text-[#A0A0AB] text-sm leading-relaxed flex-1">{note}</p>
      {cta ? (
        <a
          href={cta.href}
          className="inline-flex items-center justify-center bg-[#EEEEEF] text-[#0F0F11] font-semibold px-5 py-2.5 rounded-full text-sm hover:bg-[#FF1A1A] hover:text-white transition-colors"
        >
          {cta.label}
        </a>
      ) : null}
    </div>
  );
}
