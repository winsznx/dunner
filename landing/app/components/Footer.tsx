import Image from "next/image";

export default function Footer() {
  return (
    <footer className="bg-[#0F0F11] border-t border-[#2A2A2F] py-10 px-6">
      <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6">
        {/* Logo */}
        <Image
          src="/images/logo.png"
          alt="Dunner"
          width={432}
          height={86}
          className="opacity-50"
          style={{ height: "24px", width: "auto" }}
        />

        {/* Links */}
        <div className="flex items-center gap-8">
          <a href="#" className="text-[#6C6C74] hover:text-[#A0A0AB] text-xs transition-colors">
            Privacy
          </a>
          <a href="#" className="text-[#6C6C74] hover:text-[#A0A0AB] text-xs transition-colors">
            Terms
          </a>
          <a href="#" className="text-[#6C6C74] hover:text-[#A0A0AB] text-xs transition-colors">
            Contact
          </a>
        </div>

        {/* Right */}
        <div className="flex items-center gap-6">
          <p className="text-[#3A3A3F] text-xs font-mono">
            Built for ElevenLabs Hack #9
          </p>
          <p className="text-[#3A3A3F] text-xs">
            © 2026 Dunner
          </p>
        </div>
      </div>
    </footer>
  );
}
