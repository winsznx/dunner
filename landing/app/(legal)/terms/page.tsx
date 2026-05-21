export const metadata = {
  title: "Terms of Service · Dunner",
  description: "The agreement between Dunner and its merchants.",
};

const LAST_UPDATED = "May 21, 2026";

export default function TermsPage() {
  return (
    <article className="text-[#EEEEEF]">
      <p className="font-mono text-xs tracking-[0.2em] text-[#6C6C74] uppercase mb-4">
        Legal
      </p>
      <h1 className="text-4xl md:text-5xl font-bold tracking-tight leading-tight mb-3">
        Terms of Service
      </h1>
      <p className="text-[#6C6C74] text-sm mb-12">Last updated · {LAST_UPDATED}</p>

      <div className="space-y-10 text-[#A0A0AB] leading-relaxed">
        <section>
          <p>
            These terms (the &ldquo;Agreement&rdquo;) govern your use of
            Dunner&apos;s services. By signing up, connecting your Stripe
            account, or sending us a voice sample, you accept this Agreement.
            If you&apos;re signing up on behalf of a company, you confirm you
            have the authority to bind that company.
          </p>
        </section>

        <Section title="1. What Dunner does">
          <p>
            Dunner provides a recovery service for failed SaaS subscription
            payments. When your Stripe account fires{" "}
            <code>invoice.payment_failed</code>, we initiate an outbound
            voice call to the affected customer in your cloned voice and use
            live Stripe API access to negotiate a fix — pause, swap payment
            method, apply a coupon, downgrade plan, send a fresh checkout
            link. We earn a success fee only when a recovery succeeds.
          </p>
        </Section>

        <Section title="2. The success fee">
          <p>
            Our fee is a percentage of the recovered amount, configurable in
            your settings (default 10%, capped at 25%). It is collected via
            Stripe&apos;s <code>application_fee_amount</code> mechanism, set
            on the PaymentIntent <em>before</em> the customer&apos;s recovery
            payment is attempted. If the recovery fails, no fee is charged.
            If a refund or chargeback happens on a previously-recovered
            invoice, the corresponding fee is reversed.
          </p>
        </Section>

        <Section title="3. Your responsibilities">
          <ul>
            <li>
              You must have the legal right to call the phone numbers of your
              own customers. This typically means an active subscription
              relationship plus jurisdictional compliance (TCPA, GDPR, local
              telemarketing laws).
            </li>
            <li>
              You set working hours, retry caps, and recovery tools per your
              compliance posture. We default to conservative settings.
            </li>
            <li>
              You are responsible for the content of your knowledge base and
              the accuracy of pricing, refund, and cancellation terms you
              feed the agent. Dunner doesn&apos;t verify business claims you
              put in front of customers.
            </li>
            <li>
              You will not use Dunner for debt collection, political calls,
              fundraising, or any non-subscription-recovery use case.
            </li>
          </ul>
        </Section>

        <Section title="4. Voice clone">
          <p>
            The voice you upload during onboarding is cloned via ElevenLabs.
            By uploading, you confirm the voice belongs to you or that you
            have written permission from the speaker to clone it for
            commercial use. You retain ownership of your voice; you grant
            Dunner a non-exclusive license to use the clone solely to operate
            this service for you. You may delete the clone at any time from
            your settings.
          </p>
        </Section>

        <Section title="5. Service availability">
          <p>
            We target 99.5% monthly uptime for the recovery pipeline. We
            don&apos;t commit to SLAs during the beta period. Planned
            maintenance windows are announced via email at least 24 hours in
            advance. Webhook delivery and call placement depend on Stripe,
            ElevenLabs, and Telnyx — outages on those platforms may degrade
            our service.
          </p>
        </Section>

        <Section title="6. Pricing changes">
          <p>
            We may adjust default fee percentages or introduce platform
            charges with 30 days&apos; notice by email. Existing settings on
            your account are not changed retroactively — any update applies
            only from the effective date forward.
          </p>
        </Section>

        <Section title="7. Termination">
          <p>
            You may disconnect Stripe or delete your account at any time from
            the app. We will stop placing new calls within 5 minutes; existing
            in-flight calls complete normally. We may suspend or terminate
            access if you violate this Agreement, abuse the service, or
            create undue legal risk for us or our sub-processors. Fees
            already accrued at the time of termination remain payable.
          </p>
        </Section>

        <Section title="8. Liability">
          <p>
            Dunner is provided &ldquo;as is&rdquo;. To the maximum extent
            permitted by law, our total liability for any claim under this
            Agreement is capped at the fees you paid us in the 12 months
            prior to the claim. We are not liable for indirect, consequential,
            or punitive damages, lost profits, or third-party claims against
            you arising from your customers&apos; reactions to recovery
            calls.
          </p>
        </Section>

        <Section title="9. Governing law">
          <p>
            This Agreement is governed by the laws of the State of Delaware.
            Disputes are resolved in the state and federal courts of New
            Castle County, Delaware.
          </p>
        </Section>

        <Section title="10. Contact">
          <p>
            Terms questions:{" "}
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
      <div className="space-y-3 [&_ul]:list-disc [&_ul]:pl-6 [&_ul]:space-y-1.5 [&_code]:text-[#22D3EE] [&_code]:bg-[#1A1A1E] [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:rounded [&_code]:text-sm">
        {children}
      </div>
    </section>
  );
}
