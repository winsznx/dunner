"use client";

export default function ImageBreak() {
  return (
    <section className="relative h-[55vh] overflow-hidden">
      <div
        className="absolute inset-0 bg-cover bg-center bg-no-repeat"
        style={{ backgroundImage: "url('/images/break.webp')" }}
      />

      {/* centered text */}
      <div className="absolute inset-0 flex items-center justify-center">
        <p className="text-[#EEEEEF] text-2xl md:text-4xl lg:text-5xl font-bold text-center max-w-2xl px-6 leading-tight tracking-tight">
          Every failed invoice is a conversation{" "}
          <span className="text-[#22D3EE]">waiting to happen.</span>
        </p>
      </div>
    </section>
  );
}
