"use client";

import { useState } from "react";

export default function EarlyAccess() {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || loading) return;

    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/early-access", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Something went wrong. Please try again.");
        setLoading(false);
        return;
      }

      setSubmitted(true);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <section id="early-access" className="bg-[#0F0F11] py-32 px-6 border-t border-[#2A2A2F]">
      <div className="max-w-2xl mx-auto text-center">
        <p className="font-mono text-xs tracking-[0.2em] text-[#6C6C74] uppercase mb-6">
          Get started
        </p>
        <h2 className="text-4xl md:text-5xl font-bold text-[#EEEEEF] tracking-tight leading-tight mb-6">
          Your next failed invoice should not become churn.
        </h2>
        <p className="text-[#A0A0AB] text-lg mb-12">
          Enter your email and we&rsquo;ll send you a link to the app.
        </p>

        {submitted ? (
          <div className="bg-[#1A1A1E] border border-[#10B981]/30 rounded-2xl px-8 py-10">
            <div className="w-2 h-2 rounded-full bg-[#10B981] mx-auto mb-4 pulse-ring" />
            <p className="text-[#EEEEEF] font-semibold text-lg mb-2">
              Check your inbox.
            </p>
            <p className="text-[#A0A0AB] text-sm">
              We sent a confirmation to <span className="text-[#EEEEEF]">{email}</span>. Open it to get started.
            </p>
          </div>
        ) : (
          <>
            <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-3 max-w-md mx-auto">
              <input
                type="email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (error) setError(null);
                }}
                placeholder="your@email.com"
                required
                disabled={loading}
                className="flex-1 bg-[#1A1A1E] border border-[#3A3A3F] text-[#EEEEEF] placeholder-[#6C6C74] px-5 py-3.5 rounded-full text-sm outline-none focus:border-[#22D3EE] transition-colors disabled:opacity-50"
              />
              <button
                type="submit"
                disabled={loading}
                className="bg-[#EEEEEF] text-[#0F0F11] font-semibold px-7 py-3.5 rounded-full transition-all duration-200 hover:bg-[#FF1A1A] hover:text-white hover:scale-95 active:scale-90 whitespace-nowrap disabled:opacity-60 disabled:hover:scale-100 disabled:hover:bg-[#EEEEEF] disabled:hover:text-[#0F0F11]"
              >
                {loading ? "Sending..." : "Get early access"}
              </button>
            </form>
            {error && (
              <p className="mt-4 text-sm text-[#EF4444]">{error}</p>
            )}
          </>
        )}
      </div>
    </section>
  );
}
