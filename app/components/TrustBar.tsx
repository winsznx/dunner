"use client";

export default function TrustBar() {
  return (
    <section className="bg-[#0F0F11] py-20 px-6 border-t border-[#2A2A2F]">
      <div className="max-w-6xl mx-auto text-center">
        <p className="text-[#6C6C74] text-xs font-mono uppercase tracking-[0.2em] mb-10">
          Powered by the infrastructure you already trust
        </p>
        <div className="flex flex-wrap items-center justify-center gap-12 md:gap-20">
          {/* Stripe */}
          <div className="flex items-center gap-2.5 opacity-40 hover:opacity-70 transition-opacity">
            <svg width="20" height="20" viewBox="0 0 40 40" fill="none">
              <rect width="40" height="40" rx="6" fill="#635BFF" />
              <path d="M18.5 16.2c0-1.1.9-1.5 2.4-1.5 2.1 0 4.8.6 6.9 1.7v-6.5c-2.3-.9-4.6-1.3-6.9-1.3-5.6 0-9.4 2.9-9.4 7.8 0 7.6 10.5 6.4 10.5 9.7 0 1.3-1.1 1.7-2.7 1.7-2.3 0-5.3-.9-7.6-2.2v6.6c2.6 1.1 5.2 1.6 7.6 1.6 5.8 0 9.8-2.8 9.8-7.8-.1-8.2-10.6-6.7-10.6-9.8z" fill="white" />
            </svg>
            <span className="text-[#EEEEEF] font-semibold text-base">Stripe</span>
          </div>

          {/* ElevenLabs */}
          <div className="flex items-center gap-2.5 opacity-40 hover:opacity-70 transition-opacity">
            <svg width="20" height="20" viewBox="0 0 40 40" fill="none">
              <rect width="40" height="40" rx="6" fill="#22D3EE" />
              <rect x="10" y="10" width="6" height="20" rx="3" fill="white" />
              <rect x="22" y="14" width="6" height="12" rx="3" fill="white" />
            </svg>
            <span className="text-[#EEEEEF] font-semibold text-base">ElevenLabs</span>
          </div>

          {/* Twilio */}
          <div className="flex items-center gap-2.5 opacity-40 hover:opacity-70 transition-opacity">
            <svg width="20" height="20" viewBox="0 0 40 40" fill="none">
              <rect width="40" height="40" rx="6" fill="#F22F46" />
              <circle cx="20" cy="20" r="8" stroke="white" strokeWidth="3" fill="none" />
              <circle cx="15" cy="15" r="2.5" fill="white" />
              <circle cx="25" cy="15" r="2.5" fill="white" />
              <circle cx="25" cy="25" r="2.5" fill="white" />
              <circle cx="15" cy="25" r="2.5" fill="white" />
            </svg>
            <span className="text-[#EEEEEF] font-semibold text-base">Twilio</span>
          </div>
        </div>
      </div>
    </section>
  );
}
