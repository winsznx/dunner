import Image from "next/image";
import Link from "next/link";
import { LOGO_SRC } from "@/lib/brand";

export const metadata = {
  title: "Download · Dunner",
  description: "Install the Dunner app on iOS or Android.",
};

const ANDROID_APK_URL = process.env.ANDROID_APK_URL;
const IOS_TESTFLIGHT_URL = process.env.IOS_TESTFLIGHT_URL;

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
            Pick your phone, install the app, sign in with the 6-character
            access code from your invite email.
          </p>

          <div className="grid md:grid-cols-2 gap-4 mb-12">
            <PlatformCard
              platform="Android"
              installUrl={ANDROID_APK_URL}
              comingSoonNote="The Android APK ships this week. We&rsquo;ll email the install link the moment it lands."
              installNote="Tap the download button, then open the file from your downloads and tap Install. You may need to allow installs from unknown sources for your browser."
            />
            <PlatformCard
              platform="iOS"
              installUrl={IOS_TESTFLIGHT_URL}
              comingSoonNote="TestFlight invites are sent manually for the first cohort. Reply to your invite email with your Apple ID to be added."
              installNote="Tap the button to open TestFlight, accept the invite, then install Dunner from there."
            />
          </div>

          <div className="bg-[#1A1A1E] border border-[#2A2A2F] rounded-2xl p-6">
            <p className="text-[10px] uppercase tracking-widest text-[#6C6C74] font-medium mb-3">
              Your access code
            </p>
            <p className="text-[#EEEEEF] text-sm leading-relaxed">
              The 6-character code in your invite email gates the first
              sign-in. It binds to your email, so don&rsquo;t share it. Lost
              your invite?{" "}
              <a
                href="mailto:hello@dunner.xyz"
                className="text-[#22D3EE] hover:underline"
              >
                Email us
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
  installUrl,
  comingSoonNote,
  installNote,
}: {
  platform: string;
  installUrl: string | undefined;
  comingSoonNote: string;
  installNote: string;
}) {
  const ready = Boolean(installUrl);
  return (
    <div className="bg-[#1A1A1E] border border-[#2A2A2F] rounded-2xl p-6 flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <span className="text-[#EEEEEF] text-lg font-semibold">{platform}</span>
        <span
          className={`text-[10px] uppercase tracking-widest px-2 py-1 rounded-full font-medium ${
            ready
              ? "bg-[#10B981]/15 text-[#10B981]"
              : "bg-[#FBBF24]/15 text-[#FBBF24]"
          }`}
        >
          {ready ? "ready" : "coming soon"}
        </span>
      </div>
      <p className="text-[#A0A0AB] text-sm leading-relaxed flex-1">
        {ready ? installNote : comingSoonNote}
      </p>
      {ready && installUrl ? (
        <a
          href={installUrl}
          className="inline-flex items-center justify-center gap-2 bg-[#EEEEEF] text-[#0F0F11] font-semibold px-5 py-3 rounded-full text-sm hover:bg-[#FF1A1A] hover:text-white transition-colors"
        >
          {platform === "Android" ? "Download APK" : "Open TestFlight"}
          <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4">
            <path d="M5 12h14M13 5l7 7-7 7" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </a>
      ) : null}
    </div>
  );
}
