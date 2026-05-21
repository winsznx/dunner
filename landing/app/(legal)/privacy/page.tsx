export const metadata = {
  title: "Privacy Policy · Dunner",
  description:
    "How Dunner collects, processes, and protects merchant and end-customer data.",
};

const LAST_UPDATED = "May 21, 2026";

export default function PrivacyPage() {
  return (
    <article className="text-[#EEEEEF]">
      <p className="font-mono text-xs tracking-[0.2em] text-[#6C6C74] uppercase mb-4">
        Legal
      </p>
      <h1 className="text-4xl md:text-5xl font-bold tracking-tight leading-tight mb-3">
        Privacy Policy
      </h1>
      <p className="text-[#6C6C74] text-sm mb-12">Last updated · {LAST_UPDATED}</p>

      <div className="space-y-10 text-[#A0A0AB] leading-relaxed">
        <section>
          <p>
            Dunner (&ldquo;we&rdquo;, &ldquo;us&rdquo;) provides voice-native
            failed-payment recovery for SaaS businesses. This policy explains
            what data we collect, how we use it, and the choices you have. It
            applies to both <strong>merchants</strong> (businesses signing up
            for Dunner) and <strong>end-customers</strong> (the merchants&apos;
            own customers who receive recovery calls).
          </p>
        </section>

        <Section title="1. Data we collect">
          <h3>From merchants</h3>
          <ul>
            <li>
              <strong>Account information</strong> — email, name, and
              authentication data managed by Clerk.
            </li>
            <li>
              <strong>Stripe Connect account ID</strong> and onboarding
              status, used to deposit recovered funds and collect our success
              fee.
            </li>
            <li>
              <strong>Voice sample</strong> — a 60–120 second recording you
              make during onboarding. We pass this to ElevenLabs to generate a
              voice clone. The raw sample stays on ElevenLabs&apos;
              infrastructure; we store only the resulting voice ID.
            </li>
            <li>
              <strong>Knowledge base content</strong> — the product
              information you author to train your recovery agent.
            </li>
          </ul>

          <h3>From end-customers (the merchant&apos;s customers)</h3>
          <ul>
            <li>
              <strong>Stripe invoice metadata</strong> — name, email, phone,
              plan, amount due. We receive this via Stripe webhooks when a
              payment fails on the merchant&apos;s account.
            </li>
            <li>
              <strong>Call transcripts and recordings</strong> — produced by
              ElevenLabs after each recovery call. Stored for analytics, audit,
              and dispute resolution.
            </li>
          </ul>
          <p>
            We do <strong>not</strong> request, store, or process card
            numbers, CVV, or full PAN data. Payment instruments stay inside
            Stripe&apos;s vault on the merchant&apos;s connected account.
          </p>
        </Section>

        <Section title="2. How we use it">
          <ul>
            <li>To place outbound recovery calls on the merchant&apos;s behalf.</li>
            <li>To act on the merchant&apos;s Stripe account during a call (pause subscriptions, swap payment methods, apply coupons, etc.) — only with the agent&apos;s in-call confirmation.</li>
            <li>To compute and collect our success fee via <code>application_fee_amount</code> on the connected PaymentIntent.</li>
            <li>To send transactional emails — waitlist confirmations, access codes, invite emails.</li>
            <li>To improve product quality via aggregated, de-identified analytics.</li>
          </ul>
          <p>
            We do <strong>not</strong> sell personal data, share it with
            advertisers, or use it to train third-party general-purpose
            models.
          </p>
        </Section>

        <Section title="3. Sub-processors">
          <p>
            Dunner relies on the following providers to deliver the service.
            Each is bound by their own DPA and certifications:
          </p>
          <table className="w-full text-sm border-collapse my-4">
            <thead>
              <tr className="border-b border-[#2A2A2F] text-left">
                <th className="py-2 pr-4 text-[#EEEEEF] font-semibold">Provider</th>
                <th className="py-2 text-[#EEEEEF] font-semibold">Purpose</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-[#2A2A2F]"><td className="py-2 pr-4">Stripe</td><td className="py-2">Connect, payments, success fee</td></tr>
              <tr className="border-b border-[#2A2A2F]"><td className="py-2 pr-4">ElevenLabs</td><td className="py-2">Voice cloning, conversational agent, call transcripts</td></tr>
              <tr className="border-b border-[#2A2A2F]"><td className="py-2 pr-4">Telnyx</td><td className="py-2">SIP outbound telephony</td></tr>
              <tr className="border-b border-[#2A2A2F]"><td className="py-2 pr-4">Clerk</td><td className="py-2">Authentication, session management</td></tr>
              <tr className="border-b border-[#2A2A2F]"><td className="py-2 pr-4">Railway</td><td className="py-2">Backend hosting, Postgres, Redis</td></tr>
              <tr className="border-b border-[#2A2A2F]"><td className="py-2 pr-4">Resend</td><td className="py-2">Transactional email delivery</td></tr>
              <tr><td className="py-2 pr-4">Sentry, PostHog</td><td className="py-2">Error tracking, product analytics</td></tr>
            </tbody>
          </table>
        </Section>

        <Section title="4. Retention">
          <ul>
            <li>Merchant accounts and operational records — retained while the account is active and for 7 years after deletion (Stripe-aligned compliance window).</li>
            <li>Call transcripts and recordings — retained for 24 months from the call, then deleted unless the merchant requests a shorter retention.</li>
            <li>Waitlist signups not redeemed within 12 months are purged.</li>
          </ul>
        </Section>

        <Section title="5. Your rights">
          <p>
            Subject to your jurisdiction, you have the right to access,
            correct, export, or delete your personal data. To exercise any of
            these, email{" "}
            <a className="text-[#22D3EE] hover:underline" href="mailto:hello@dunner.xyz">
              hello@dunner.xyz
            </a>{" "}
            from the address associated with your account. We respond within
            30 days.
          </p>
        </Section>

        <Section title="6. Security">
          <p>
            All traffic is TLS 1.2+. Stripe and ElevenLabs webhook payloads
            are signature-verified before any database write. Authentication
            tokens are JWTs verified statelessly. Per-merchant data isolation
            is enforced at every query — one merchant cannot read another&apos;s
            recoveries or customer data. Sensitive bearer tokens for agent
            callbacks are bcrypt-hashed at rest.
          </p>
        </Section>

        <Section title="7. Changes">
          <p>
            We&apos;ll update this page when our practices change and post the
            new effective date at the top. Material changes are also emailed
            to active merchants.
          </p>
        </Section>

        <Section title="8. Contact">
          <p>
            Privacy questions:{" "}
            <a className="text-[#22D3EE] hover:underline" href="mailto:hello@dunner.xyz">
              hello@dunner.xyz
            </a>
            .
          </p>
        </Section>
      </div>
    </article>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <h2 className="text-2xl font-semibold text-[#EEEEEF] tracking-tight">
        {title}
      </h2>
      <div className="space-y-3 [&_ul]:list-disc [&_ul]:pl-6 [&_ul]:space-y-1.5 [&_h3]:text-[#EEEEEF] [&_h3]:font-medium [&_h3]:mt-4 [&_code]:text-[#22D3EE] [&_code]:bg-[#1A1A1E] [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:rounded [&_code]:text-sm">
        {children}
      </div>
    </section>
  );
}
