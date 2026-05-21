"use client";

import { useEffect, useState } from "react";
import Image from "next/image";

export default function Nav() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <nav
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        scrolled
          ? "bg-[#0F0F11]/80 backdrop-blur-md border-b border-[#2A2A2F]"
          : "bg-transparent"
      }`}
    >
      <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
        {/* Logo */}
        <div className="flex items-center gap-2">
          <Image
            src="/images/logo.png"
            alt="Dunner"
            width={120}
            height={36}
            className="h-8 w-auto object-contain"
            priority
          />
        </div>

        {/* Links */}
        <div className="hidden md:flex items-center gap-8">
          <a
            href="#how-it-works"
            className="text-[#A0A0AB] hover:text-[#EEEEEF] text-sm transition-colors"
          >
            How it works
          </a>
          <a
            href="#pricing"
            className="text-[#A0A0AB] hover:text-[#EEEEEF] text-sm transition-colors"
          >
            Pricing
          </a>
        </div>

        {/* CTA */}
        <a
          href="#early-access"
          className="bg-[#EEEEEF] text-[#0F0F11] text-sm font-semibold px-5 py-2.5 rounded-full hover:bg-white transition-colors"
        >
          Get early access
        </a>
      </div>
    </nav>
  );
}
