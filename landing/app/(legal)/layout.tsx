import Image from "next/image";
import Link from "next/link";
import { LOGO_INTRINSIC, LOGO_SRC } from "@/lib/brand";

export default function LegalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-[#0F0F11] text-[#EEEEEF] flex flex-col">
      <header className="px-6 py-6 border-b border-[#2A2A2F]">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <Link href="/" className="inline-flex items-center">
            <Image
              src={LOGO_SRC}
              alt="Dunner"
              width={LOGO_INTRINSIC.width}
              height={LOGO_INTRINSIC.height}
              style={{ height: "24px", width: "auto" }}
              priority
            />
          </Link>
          <Link
            href="/"
            className="text-[#A0A0AB] hover:text-[#EEEEEF] text-xs transition-colors"
          >
            ← Back home
          </Link>
        </div>
      </header>
      <main className="flex-1 px-6 py-16 md:py-24">
        <div className="max-w-3xl mx-auto prose-dunner">{children}</div>
      </main>
      <footer className="px-6 py-8 border-t border-[#2A2A2F]">
        <p className="max-w-3xl mx-auto text-[#3A3A3F] text-xs text-center">
          © 2026 Dunner. All rights reserved.
        </p>
      </footer>
    </div>
  );
}
