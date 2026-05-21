"use client";

export default function Hero() {
  return (
    <section className="relative min-h-screen flex items-center overflow-hidden">
      {/* Full bleed background image */}
      <div
        className="absolute inset-0 bg-cover bg-center bg-no-repeat"
        style={{ backgroundImage: "url('/images/hero.webp')" }}
      />


      {/* Content — flush to left edge */}
      <div className="relative z-10 w-full px-8 md:px-14 pt-24 pb-20">
        <div className="max-w-2xl">
          {/* Eyebrow */}
          <p className="font-mono text-xs tracking-[0.2em] text-[#A0A0AB] uppercase mb-6 fade-up fade-up-1">
            Revenue Recovery
          </p>

          {/* Headline */}
          <h1 className="text-6xl md:text-7xl lg:text-[88px] font-extrabold leading-[1.0] tracking-tight mb-6 fade-up fade-up-2">
            <span className="text-[#EEEEEF]">When payments fail,</span>
            <br />
            <span style={{ WebkitTextStroke: "2px #EEEEEF", color: "transparent" }}>
              Dunner calls.
            </span>
          </h1>

          {/* Subline */}
          <p className="text-lg text-[#A0A0AB] leading-relaxed mb-10 max-w-lg fade-up fade-up-3">
            The only recovery tool that sounds like you — and only charges when it works.
          </p>

          {/* CTAs */}
          <div className="flex items-center gap-4 fade-up fade-up-4">
            <a
              href="#early-access"
              className="bg-[#EEEEEF] text-[#0F0F11] font-semibold px-7 py-3.5 rounded-full transition-all duration-200 hover:bg-[#FF1A1A] hover:text-white hover:scale-95 active:scale-90"
            >
              Get early access
            </a>
            <a
              href="#how-it-works"
              className="text-[#EEEEEF] font-medium px-7 py-3.5 rounded-full border border-[#3A3A3F] transition-all duration-200 hover:border-[#FF1A1A] hover:text-[#FF1A1A] hover:scale-95 active:scale-90"
            >
              See how it works
            </a>
          </div>
        </div>
      </div>

      {/* Waveform indicator bottom right */}
      <div className="absolute bottom-10 right-10 hidden md:flex items-end gap-[3px] opacity-50">
        {[16, 28, 40, 32, 48, 36, 24, 40, 32, 20, 36, 28].map((h, i) => (
          <div
            key={i}
            className="wave-bar"
            style={{ height: `${h}px`, animationDelay: `${i * 0.08}s` }}
          />
        ))}
      </div>
    </section>
  );
}
