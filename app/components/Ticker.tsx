"use client";

const pairs = [
  { problem: "Emails get ignored.", solution: "Dunner calls." },
  { problem: "Bots feel fake.", solution: "Dunner sounds like you." },
  { problem: "Retries fail silently.", solution: "Dunner negotiates." },
  { problem: "Churn happens quietly.", solution: "Dunner stops it." },
  { problem: "Manual calls don't scale.", solution: "Dunner handles them all." },
  { problem: "Customers just disappear.", solution: "Dunner brings them back." },
];

export default function Ticker() {
  const doubled = [...pairs, ...pairs];

  return (
    <section className="bg-[#0F0F11] py-16 overflow-hidden border-y border-[#2A2A2F]">
      <div className="flex">
        <div className="ticker-track flex items-center gap-0 whitespace-nowrap">
          {doubled.map((pair, i) => (
            <span key={i} className="flex items-center">
              <span className="text-[#6C6C74] text-lg font-medium px-8">
                {pair.problem}
              </span>
              <span className="text-[0.5rem] text-[#3A3A3F] px-2">→</span>
              <span className="text-[#22D3EE] text-lg font-semibold px-8">
                {pair.solution}
              </span>
              <span className="text-[#2A2A2F] px-4 text-xl">·</span>
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
