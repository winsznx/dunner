"use client";

import { useEffect, useRef, useState } from "react";

export default function DemoSection() {
  const ref = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          videoRef.current?.play().catch(() => {});
        }
      },
      { threshold: 0.2 }
    );
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);

  return (
    <section
      ref={ref}
      className="bg-[#0F0F11] py-28 px-6 border-t border-[#2A2A2F]"
    >
      <div className="max-w-6xl mx-auto">
        <div className="grid md:grid-cols-2 gap-16 items-center">
          {/* Left — copy */}
          <div
            className={`transition-all duration-700 ${
              visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
            }`}
          >
            <p className="font-mono text-xs tracking-[0.2em] text-[#6C6C74] uppercase mb-6">
              Live demo
            </p>
            <h2 className="text-4xl md:text-5xl font-bold text-[#EEEEEF] tracking-tight leading-tight mb-6">
              Here it is,{" "}
              <span className="text-[#FF1A1A]">working.</span>
            </h2>
            <p className="text-[#A0A0AB] text-lg leading-relaxed mb-8">
              Onboarding to live recovery in under two minutes. This is the real app, not a mockup.
            </p>
            <div className="space-y-4">
              {[
                "Sign in. Connect Stripe.",
                "Record your voice. Once.",
                "Watch recoveries happen live.",
              ].map((point, i) => (
                <div key={i} className="flex items-start gap-3">
                  <span className="font-mono text-xs text-[#FF1A1A] mt-1 shrink-0">
                    0{i + 1}
                  </span>
                  <p className="text-[#A0A0AB] text-sm">{point}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Right — video in phone-shaped frame */}
          <div
            className={`flex justify-center md:justify-end transition-all duration-700 delay-200 ${
              visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
            }`}
          >
            <div
              className="relative rounded-[44px] overflow-hidden bg-[#0F0F11] border-[8px] border-[#1A1A1E] shadow-[0_30px_80px_-20px_rgba(0,0,0,0.8)]"
              style={{
                aspectRatio: "9 / 19.5",
                width: "100%",
                maxWidth: "320px",
              }}
            >
              <video
                ref={videoRef}
                src="/videos/demo.mov"
                autoPlay
                loop
                muted
                playsInline
                className="w-full h-full object-cover"
              />
              {/* subtle dynamic island */}
              <div
                className="absolute top-3 left-1/2 -translate-x-1/2 w-24 h-7 bg-black rounded-full pointer-events-none"
                aria-hidden
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
