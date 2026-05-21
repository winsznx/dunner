"use client";

import { useEffect, useRef, useState } from "react";

const actions = [
  {
    title: "Swap payment method",
    copy: "Send a secure link. Customer adds a new card mid-call.",
  },
  {
    title: "Apply coupon",
    copy: "Up to 20% off the current invoice. One-time, configurable.",
  },
  {
    title: "Downgrade plan",
    copy: "Move the customer to a lower tier to keep them active.",
  },
  {
    title: "Pause subscription",
    copy: "Pause for up to 30 days. Keeps the customer warm.",
  },
  {
    title: "Send recovery link",
    copy: "Fire a fresh hosted invoice URL to their phone via SMS.",
  },
  {
    title: "Log churn reason",
    copy: "If they cancel, capture the reason and close gracefully.",
  },
];

export default function StripeActions() {
  const gridRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setVisible(true); },
      { threshold: 0.15 }
    );
    if (gridRef.current) observer.observe(gridRef.current);
    return () => observer.disconnect();
  }, []);

  return (
    <>
      {/* Cinematic image moment */}
      <section className="relative h-screen flex items-center justify-center overflow-hidden">
        <div
          className="absolute inset-0 bg-cover bg-center bg-no-repeat"
          style={{ backgroundImage: "url('/images/actions.png')" }}
        />

        {/* Headline centered over image */}
        <div className="relative z-10 text-center px-6">
          <p className="font-mono text-xs tracking-[0.2em] text-[#0F0F11]/60 uppercase mb-6">
            Live Stripe access
          </p>
          <h2 className="text-5xl md:text-7xl lg:text-[96px] font-extrabold leading-[1.0] tracking-tight">
            <span className="text-[#0F0F11]">The call can</span>
            <br />
            <span className="text-[#0F0F11]">actually </span>
            <span
              style={{
                WebkitTextStroke: "2px #0F0F11",
                color: "transparent",
              }}
            >
              do something.
            </span>
          </h2>
        </div>
      </section>

      {/* Dark grid section */}
      <section ref={gridRef} className="bg-[#0F0F11] py-24 px-6">
        <div className="max-w-6xl mx-auto">
          <div className="grid md:grid-cols-3 gap-px bg-[#2A2A2F]">
            {actions.map((action, i) => (
              <div
                key={i}
                className={`bg-[#0F0F11] p-8 hover:bg-[#1A1A1E] transition-all duration-300 group ${
                  visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
                }`}
                style={{
                  transitionDelay: visible ? `${i * 80}ms` : "0ms",
                  transitionProperty: "opacity, transform, background-color",
                  transitionDuration: "600ms",
                }}
              >
                <div className="w-1 h-6 bg-[#635BFF] mb-6 group-hover:h-8 transition-all duration-200" />
                <h3 className="text-[#EEEEEF] font-semibold mb-3 text-base">
                  {action.title}
                </h3>
                <p className="text-[#6C6C74] text-sm leading-relaxed">
                  {action.copy}
                </p>
              </div>
            ))}
          </div>

          <p
            className={`mt-8 text-[#6C6C74] text-sm transition-all duration-700 delay-500 ${
              visible ? "opacity-100" : "opacity-0"
            }`}
          >
            All actions execute live on your connected Stripe account during the call. No delays. No manual follow-up.
          </p>
        </div>
      </section>
    </>
  );
}
