"use client";

import { useEffect, useRef, useState } from "react";

const steps = [
  {
    number: "01",
    title: "A payment fails.",
    copy: "Stripe sends the signal. Dunner catches it instantly and queues a recovery.",
  },
  {
    number: "02",
    title: "Dunner calls. In your voice.",
    copy: "Your cloned voice contacts the customer within minutes — not a bot, not a script. You.",
  },
  {
    number: "03",
    title: "The invoice is paid.",
    copy: "Dunner negotiates, applies a fix, and closes the invoice. We take our fee. You keep the rest.",
  },
];

export default function HowItWorks() {
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
    <section id="how-it-works" ref={ref} className="bg-[#0F0F11] py-28 px-6">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div
          className={`mb-20 transition-all duration-700 ${
            visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
          }`}
        >
          <p className="font-mono text-xs tracking-[0.2em] text-[#6C6C74] uppercase mb-4">
            The process
          </p>
          <h2 className="text-4xl md:text-5xl font-bold text-[#EEEEEF] tracking-tight">
            Here&rsquo;s what happens.
          </h2>
        </div>

        {/* Steps */}
        <div className="grid md:grid-cols-3 gap-px bg-[#2A2A2F]">
          {steps.map((step, i) => (
            <div
              key={i}
              className={`bg-[#0F0F11] p-10 transition-all duration-700 ${
                visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
              }`}
              style={{ transitionDelay: visible ? `${i * 150}ms` : "0ms" }}
            >
              <p className="font-mono text-xs text-[#3A3A3F] mb-8 tracking-widest">
                {step.number}
              </p>
              <h3 className="text-xl font-semibold text-[#EEEEEF] mb-4 leading-snug">
                {step.title}
              </h3>
              <p className="text-[#A0A0AB] text-sm leading-relaxed">
                {step.copy}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
