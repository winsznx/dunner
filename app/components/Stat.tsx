"use client";

import { useEffect, useRef, useState } from "react";

export default function Stat() {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setVisible(true); },
      { threshold: 0.5 }
    );
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);

  const lines = ["9% of MRR.", "Lost silently.", "Every month."];

  return (
    <section ref={ref} className="bg-[#0F0F11] py-32 px-6">
      <div className="max-w-6xl mx-auto text-center">
        <div className="flex flex-col items-center gap-2">
          {lines.map((line, i) => (
            <p
              key={i}
              className={`font-mono text-4xl md:text-6xl lg:text-7xl font-semibold tracking-tight transition-all duration-700 ${
                visible
                  ? "opacity-100 translate-y-0"
                  : "opacity-0 translate-y-8"
              }`}
              style={{
                transitionDelay: visible ? `${i * 180}ms` : "0ms",
                color: i === 0 ? "#EEEEEF" : i === 1 ? "#A0A0AB" : "#6C6C74",
              }}
            >
              {line}
            </p>
          ))}
        </div>
        <p
          className={`mt-8 text-[#6C6C74] text-sm font-mono tracking-widest uppercase transition-all duration-700 ${
            visible ? "opacity-100" : "opacity-0"
          }`}
          style={{ transitionDelay: visible ? "600ms" : "0ms" }}
        >
          Average involuntary churn for SaaS companies
        </p>
      </div>
    </section>
  );
}
