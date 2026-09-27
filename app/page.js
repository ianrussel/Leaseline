import Analytics from "@/components/Analytics";
import ChatWidget from "@/components/landing/ChatWidget";
import BetaForm from "@/components/landing/BetaForm";
import UrgencyBadge, { CategoryBadge } from "@/components/UrgencyBadge";

const CONTACT_EMAIL = "ianrussel537@gmail.com";

// Beta intake is on hold while the triage engine is still being built - flip this to show the
// signup form (components/landing/BetaForm.js) instead of the "in development" status card.
const BETA_INTAKE_OPEN = false;

const DEMO_TICKETS = [
  {
    time: "11:42 PM",
    unit: "Unit 4B",
    number: "LL-10482",
    message: (
      <>
        hi its unit 4B the sink under the kitchen has been leaking for 2 days now theres water pooling near the
        dishwasher can someone come look asap
        <br />
        <br />
        also the hallway light on 2nd floor still out from last week
      </>
    ),
    issues: [
      ["Plumbing", "High"],
      ["Electrical", "Low"],
    ],
    reply:
      "Hi! Thanks for flagging this - a leak near the dishwasher is a priority, so we're dispatching a plumber today. We've also logged the hallway light for the same visit. We'll confirm the appointment window shortly.",
  },
  {
    time: "7:15 AM",
    unit: "Unit 9C",
    number: "LL-10483",
    message: "unit 9C here the stove smells like gas when i turn the burner on not sure if its safe to use",
    issues: [["Appliance", "Emergency"]],
    reply:
      "Thanks for flagging this right away - a gas smell is urgent, so we're dispatching someone today. Please don't use that burner until then, and if the smell gets stronger, leave the unit and call the gas company's emergency line.",
  },
  {
    time: "6:03 PM",
    unit: "Unit 12C",
    number: "LL-10484",
    message:
      "hi its unit 12C we've seen a few roaches in the kitchen the last couple nights nothing crazy but wanted to flag it",
    issues: [["Pest", "Medium"]],
    reply: "Thanks for the heads up - we've logged this and will have pest control take a look in the next few days.",
  },
  {
    time: "9:20 AM",
    unit: "Unit 3A",
    number: "LL-10485",
    message:
      "hey so the neighbors upstairs have been pretty loud every night this week just wanted to mention it whenever you get a chance",
    issues: [["Noise", "Low"]],
    reply:
      "Thanks for letting us know - we've added this to the schedule and will follow up with the unit above during our next round of check-ins.",
  },
];

const SCENARIOS = [
  `A text at 11pm just says "it's bad." Bad how? Now you're calling back to find out.`,
  "The same leak shows up as two separate work orders - one by text, one by email - because nobody's cross-checking.",
  "Every reply gets typed from scratch, and it shows: a little different, a little slower, every time.",
  `Something genuinely urgent - a gas smell, no heat in January - sits in the same queue as "the doorbell buzzes weird."`,
];

const STEPS = [
  ["Forward it in", "Paste a message, forward the email, or connect your inbox - whatever's already landing gets routed to Leaseline as-is."],
  ["Triaged in ~2 seconds", "Category, urgency, and a drafted reply come back - even for messages that bundle two or three issues into one rambling text."],
  ["You approve, it's sent", "One click to send the draft as-is, edit it first, or escalate straight to your vendor. Nothing goes out without you."],
];

const VALUES = [
  ["Never miss the real emergency", "Gas smells, flooding, no heat in winter - flagged Emergency or High automatically, even buried in a rambling message."],
  ["One clean reply, every time", "Consistent, professional tone on every response. Edit in one click - no blank page staring back at you at 11pm."],
  ["Splits multi-issue messages", "One text about the sink and the hallway light becomes two tickets, each triaged and routed on its own."],
];

const wrap = "mx-auto max-w-[1080px] px-4 sm:px-7";
const eyebrow = "font-mono text-xs font-medium uppercase tracking-[0.14em] text-accent";
const heading = "font-display font-extrabold uppercase leading-[0.98]";
const sectionHeading = `${heading} text-[clamp(1.8rem,3.4vw,2.5rem)]`;
const btn =
  "inline-flex items-center gap-2 bg-accent font-mono font-semibold tracking-[0.02em] text-accent-contrast no-underline transition-colors hover:bg-accent-hover focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-accent";

function Logo() {
  return (
    <div className="flex items-baseline gap-2 font-display text-[22px] font-black uppercase tracking-[0.02em]">
      <span className="inline-block size-2.5 flex-none rotate-45 bg-accent" aria-hidden="true" />
      LEASELINE
      <small className="font-mono text-[11px] font-medium normal-case tracking-[0.02em] text-muted">
        maintenance triage
      </small>
    </div>
  );
}

function DemoTicket({ ticket }) {
  return (
    <div className="grid items-start gap-5 md:grid-cols-2">
      <div className="flex flex-col gap-3.5 border border-line bg-surface px-6 py-5">
        <div className="flex justify-between font-mono text-[11px] uppercase tracking-[0.12em] text-muted">
          <span>What lands in your inbox</span>
          <span>{ticket.time}</span>
        </div>
        <div className="border border-dashed border-line bg-surface-2 px-4 py-3.5 font-mono text-[13.5px] leading-[1.65]">
          {ticket.message}
        </div>
      </div>
      <div className="flex flex-col gap-3.5 border border-line bg-surface px-6 py-5">
        <div className="flex items-baseline justify-between border-b border-line pb-2.5 font-mono text-xs text-muted">
          <span>
            TICKET <strong className="font-semibold text-ink">#{ticket.number}</strong>
          </span>
          <span>{ticket.unit}</span>
        </div>
        <div className="flex flex-col gap-2">
          {ticket.issues.map(([category, urgency]) => (
            <div key={category} className="flex flex-wrap gap-2">
              <CategoryBadge>{category}</CategoryBadge>
              <UrgencyBadge urgency={urgency} uppercase />
            </div>
          ))}
        </div>
        <div className="mt-0.5 border-t border-line pt-3 text-[15px]">
          <em className="mb-1.5 block font-mono text-[11px] uppercase not-italic tracking-[0.08em] text-muted">
            Drafted reply
          </em>
          {ticket.reply}
        </div>
      </div>
    </div>
  );
}

export default function LandingPage() {
  return (
    <>
      <Analytics />

      <header className="border-b border-line">
        <div className={`${wrap} flex items-center justify-between gap-4 py-[18px]`}>
          <Logo />
          <nav className="hidden gap-6 font-mono text-[13px] sm:flex">
            <a href="#how" className="text-muted no-underline hover:text-accent">
              How it works
            </a>
            <a href="#pricing" className="text-muted no-underline hover:text-accent">
              Pricing
            </a>
          </nav>
          <a className={`${btn} px-3.5 py-2 text-xs`} href="#beta-form">
            Beta status
          </a>
        </div>
      </header>

      <main>
        <section className="mx-auto grid max-w-[760px] gap-5 px-4 pt-16 pb-12 sm:px-7">
          <span className={eyebrow}>AI Maintenance Triage · In Development</span>
          <h1 className={`${heading} text-[clamp(2.6rem,5.4vw,4.4rem)]`}>
            Every tenant text, sorted before your coffee&apos;s cold.
          </h1>
          <p className="max-w-[58ch] text-[19px] text-muted">
            Leaseline reads maintenance requests the moment they land - plumbing, electrical, pest, all of it - tags
            the urgency, and hands you a reply that&apos;s ready to send. No more re-reading a 2am text three times to
            figure out if it&apos;s actually a burst pipe.
          </p>
          <div className="flex flex-wrap items-center gap-3.5">
            <a className={`${btn} px-5 py-[11px] text-[13px]`} href="#beta-form">
              See beta status
            </a>
            <span className="font-mono text-xs text-muted">Currently in development · early access opening soon</span>
          </div>
        </section>

        <section className={`${wrap} flex flex-col gap-5 pt-2 pb-16`}>
          {DEMO_TICKETS.map((ticket) => (
            <DemoTicket key={ticket.number} ticket={ticket} />
          ))}
        </section>

        <section className={`${wrap} border-t border-line py-12`}>
          <div className="grid items-start gap-10 md:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
            <h2 className={`${sectionHeading} max-w-[14ch]`}>You&apos;re already running a full-time triage desk.</h2>
            <div className="flex flex-col">
              {SCENARIOS.map((text) => (
                <div
                  key={text}
                  className="grid grid-cols-[28px_1fr] gap-3 border-b border-line py-4 first:pt-0"
                >
                  <span className="font-mono font-semibold text-urgency-emergency">-</span>
                  <p className="m-0">{text}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className={`${wrap} border-t border-line py-14`} id="how">
          <h2 className={`${sectionHeading} mb-8`}>How it works</h2>
          <div className="grid gap-5 md:grid-cols-3">
            {STEPS.map(([title, body], i) => (
              <div key={title} className="border border-line bg-surface px-5 pt-5 pb-[22px]">
                <span className="mb-2.5 block font-mono text-xs font-semibold tracking-[0.06em] text-accent">
                  TICKET 0{i + 1}
                </span>
                <h3 className="mb-2 font-display text-[22px] font-bold leading-none">{title}</h3>
                <p className="m-0 text-[15px] text-muted">{body}</p>
              </div>
            ))}
          </div>
        </section>

        <section className={`${wrap} border-t border-line py-14`}>
          <div className="grid gap-5 md:grid-cols-3">
            {VALUES.map(([title, body]) => (
              <div key={title} className="border border-t-[3px] border-line border-t-accent bg-surface px-5 py-[22px]">
                <h3 className="mb-2 font-display text-xl font-bold leading-none">{title}</h3>
                <p className="m-0 text-[15px] text-muted">{body}</p>
              </div>
            ))}
          </div>
        </section>

        <section className={`${wrap} border-t border-line py-12`} id="pricing">
          <div className="flex flex-wrap items-center justify-between gap-6 border border-line bg-surface px-[30px] py-7">
            <div>
              <h2 className={`${heading} mb-2 text-[clamp(1.6rem,3vw,2.1rem)]`}>Beta pricing</h2>
              <p className="m-0 max-w-[48ch] text-muted">
                Free for the length of the beta. Afterward, plans start at $29/mo for up to 100 tickets - no per-unit
                fees, no setup cost. Beta users lock in founder pricing for life.
              </p>
            </div>
            <div className="text-right font-mono">
              <div className="text-[28px] font-semibold">$0</div>
              <div className="text-xs text-muted">during beta</div>
            </div>
          </div>
        </section>

        <section className={`${wrap} border-t border-line pt-14 pb-[72px]`} id="beta-form">
          <div className="mb-8 flex flex-col items-center text-center">
            <span className={eyebrow}>Status update</span>
            <h2 className={`${sectionHeading} mt-2`}>In development</h2>
          </div>
          <div className="mx-auto max-w-[640px] border border-line bg-surface">
            {BETA_INTAKE_OPEN ? (
              <BetaForm fallbackEmail={CONTACT_EMAIL} />
            ) : (
              <>
                <div className="flex items-center justify-between border-b border-dashed border-line px-6 py-4 font-mono text-xs uppercase tracking-[0.06em] text-muted">
                  <span>Beta intake</span>
                  <span>on hold</span>
                </div>
                <div className="flex flex-col gap-2.5 px-6 py-8 text-muted">
                  <p className="m-0">
                    Leaseline is currently in development - we&apos;re building and testing the AI triage engine behind
                    the scenes. Once that phase is done, we&apos;ll open early access to beta joiners.
                  </p>
                  <p className="m-0">
                    Want to be notified the moment it&apos;s ready? Email us at{" "}
                    <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a> and we&apos;ll reach out personally when
                    beta spots open.
                  </p>
                </div>
              </>
            )}
          </div>
        </section>
      </main>

      <footer className="border-t border-line pt-7 pb-10">
        <div className={`${wrap} flex flex-wrap justify-between gap-3 font-mono text-xs text-muted`}>
          <span>Leaseline is an independent beta project - built solo, no VC gradient required.</span>
          <a href={`mailto:${CONTACT_EMAIL}`} className="text-muted">
            {CONTACT_EMAIL}
          </a>
        </div>
      </footer>

      <ChatWidget contactEmail={CONTACT_EMAIL} />
    </>
  );
}
