"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";

export default function Pricing() {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setVisible(true); },
      { threshold: 0.2 }
    );
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);

  return (
    <section id="pricing" ref={ref} className="bg-[#0F0F11] py-28 px-6 border-t border-[#2A2A2F]">
      <div className="max-w-6xl mx-auto">
        <div className="grid md:grid-cols-2 gap-0 overflow-hidden rounded-2xl border border-[#2A2A2F]">
          {/* Left — image */}
          <div
            className={`relative overflow-hidden min-h-[460px] transition-all duration-700 ${
              visible ? "opacity-100" : "opacity-0"
            }`}
          >
            <Image
              src="/images/pricing.webp"
              alt="Operator on the phone"
              fill
              className="object-cover object-top"
            />
          </div>

          {/* Right — card */}
          <div
            className={`bg-[#1A1A1E] p-12 flex flex-col justify-center transition-all duration-700 delay-200 ${
              visible ? "opacity-100 translate-x-0" : "opacity-0 translate-x-8"
            }`}
          >
            <p className="font-mono text-xs tracking-[0.2em] text-[#6C6C74] uppercase mb-6">
              Pricing
            </p>
            <h2 className="text-3xl md:text-4xl font-bold text-[#EEEEEF] tracking-tight leading-tight mb-10">
              Dunner only wins when you recover revenue.
            </h2>

            {/* Fee breakdown */}
            <div className="space-y-0 border border-[#2A2A2F] rounded-xl overflow-hidden mb-10">
              <div className="flex items-center justify-between px-6 py-4 border-b border-[#2A2A2F]">
                <span className="text-[#A0A0AB] text-sm">Recovered invoice</span>
                <span className="font-mono text-[#EEEEEF] font-semibold">$100.00</span>
              </div>
              <div className="flex items-center justify-between px-6 py-4 border-b border-[#2A2A2F]">
                <span className="text-[#A0A0AB] text-sm">Dunner fee</span>
                <span className="font-mono text-[#EF4444] font-semibold">−$10.00</span>
              </div>
              <div className="flex items-center justify-between px-6 py-4 bg-[#242428]">
                <span className="text-[#EEEEEF] text-sm font-semibold">You keep</span>
                <span className="font-mono text-[#10B981] font-bold text-lg">$90.00</span>
              </div>
            </div>

            <div className="space-y-3 mb-10">
              {[
                "No monthly fee",
                "No setup cost",
                "No risk — pay only on recovery",
              ].map((item, i) => (
                <div key={i} className="flex items-center gap-3">
                  <div className="w-1.5 h-1.5 rounded-full bg-[#10B981] shrink-0" />
                  <p className="text-[#A0A0AB] text-sm">{item}</p>
                </div>
              ))}
            </div>

            <a
              href="#early-access"
              className="bg-[#EEEEEF] text-[#0F0F11] font-semibold px-7 py-3.5 rounded-full hover:bg-white transition-all text-center hover:scale-[1.02] active:scale-[0.98]"
            >
              Get early access
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
