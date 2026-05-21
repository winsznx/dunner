"use client";

import { useEffect, useRef, useState } from "react";

function GlowYou() {
  const [hovered, setHovered] = useState(false);
  return (
    <span
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        color: "#22D3EE",
        cursor: "default",
        transition: "text-shadow 0.3s ease",
        textShadow: hovered
          ? "0 0 20px rgba(34,211,238,0.9), 0 0 50px rgba(34,211,238,0.6), 0 0 100px rgba(34,211,238,0.3)"
          : "none",
      }}
    >
      you
    </span>
  );
}

export default function VoiceSection() {
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
    <section ref={ref} className="bg-[#0F0F11] py-28 px-6 border-t border-[#2A2A2F]">
      <div className="max-w-6xl mx-auto">
        <div className="grid md:grid-cols-2 gap-16 items-center">
          {/* Left — voice card */}
          <div
            className={`transition-all duration-700 ${
              visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
            }`}
          >
            {/* Voice identity card */}
            <div className="bg-[#1A1A1E] border border-[#2A2A2F] rounded-2xl p-8">
              <div className="flex items-center gap-3 mb-8">
                <div className="w-2 h-2 rounded-full bg-[#10B981] pulse-ring" />
                <span className="font-mono text-xs text-[#6C6C74] tracking-widest uppercase">
                  Live · Connected
                </span>
              </div>

              {/* Waveform */}
              <div className="flex items-end gap-[3px] mb-8 h-16">
                {[12, 28, 40, 20, 48, 32, 16, 44, 36, 24, 48, 28, 40, 20, 36, 16, 44, 32].map(
                  (h, i) => (
                    <div
                      key={i}
                      className="wave-bar"
                      style={{
                        height: `${h}px`,
                        animationDelay: `${i * 0.07}s`,
                      }}
                    />
                  )
                )}
              </div>

              {/* Voice label */}
              <div className="border-t border-[#2A2A2F] pt-6">
                <p className="text-[#6C6C74] font-mono text-xs uppercase tracking-widest mb-1">
                  Voice identity
                </p>
                <p className="text-[#EEEEEF] font-semibold text-lg">Your voice</p>
                <p className="text-[#A0A0AB] text-sm mt-1">
                  Cloned from your 75-second recording
                </p>
              </div>

              {/* Call transcript preview */}
              <div className="mt-6 space-y-3">
                <div className="flex justify-end">
                  <div className="bg-[#242428] rounded-xl rounded-tr-sm px-4 py-3 max-w-xs">
                    <p className="text-[#EEEEEF] text-sm">
                      &ldquo;Hey Lara, it&rsquo;s about your Pro subscription — your card was declined. Can we sort this out now?&rdquo;
                    </p>
                  </div>
                </div>
                <div className="flex justify-start">
                  <div className="bg-[#2A2A2F] rounded-xl rounded-tl-sm px-4 py-3 max-w-xs">
                    <p className="text-[#A0A0AB] text-sm">
                      &ldquo;Oh — yes, let me give you a new card.&rdquo;
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Right — copy */}
          <div
            className={`transition-all duration-700 delay-150 ${
              visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
            }`}
          >
            <p className="font-mono text-xs tracking-[0.2em] text-[#6C6C74] uppercase mb-6">
              The clever thing
            </p>
            <h2 className="text-4xl md:text-5xl font-bold text-[#EEEEEF] tracking-tight leading-tight mb-6">
              It doesn&rsquo;t sound like a bot
              <br />
              It sounds like{" "}
              <GlowYou />
            </h2>
            <p className="text-[#A0A0AB] text-lg leading-relaxed mb-8">
              Dunner clones your voice from a 75-second recording. Every recovery call is placed in your voice — not a generic agent, not a call center. Your actual vendor relationship, automated.
            </p>
            <div className="space-y-4">
              {[
                "Customers hear a familiar voice, not a bot",
                "Trust is preserved. Relationships stay intact.",
                "Your voice is only used for recovery calls",
              ].map((point, i) => (
                <div key={i} className="flex items-start gap-3">
                  <div className="w-1.5 h-1.5 rounded-full bg-[#22D3EE] mt-2 shrink-0" />
                  <p className="text-[#A0A0AB] text-sm">{point}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
