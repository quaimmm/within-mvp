import Link from "next/link";
import { BrandLogo } from "@/components/brand-logo";

const principles = [
  ["AI proposes.", "Turn intent into a clear, reviewable spending rule."],
  ["Humans approve.", "Keep judgement with the people accountable for company spend."],
  ["Arc executes.", "Carry approved decisions into programmable testnet settlement."],
] as const;

export default function AboutPage() {
  return <div className="min-h-screen bg-canvas text-ink">
    <header className="mx-auto flex h-[72px] max-w-[1120px] items-center justify-between border-b border-border px-6 lg:px-0">
      <Link href="/" aria-label="Within home"><BrandLogo variant="header"/></Link>
      <Link href="/" className="text-[10px] text-muted transition-colors hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent">Back to Within</Link>
    </header>
    <main className="mx-auto max-w-[1120px] px-6 py-24 lg:px-0 lg:py-32">
      <p className="text-[10px] text-accent">About Within</p>
      <h1 className="mt-5 max-w-3xl text-[56px] font-normal leading-[1.02] tracking-[-0.055em] md:text-[72px]">Programmable company spending.</h1>
      <p className="mt-9 max-w-2xl text-[15px] leading-7 text-muted">Within brings spending rules, human judgement and programmable settlement into one clear workspace.</p>
      <section className="mt-24 grid gap-10 border-y border-border py-10 md:grid-cols-3 md:divide-x md:divide-border">
        {principles.map(([title, copy], index) => <article key={title} className={index === 0 ? "" : "md:pl-10"}><h2 className="text-[22px] font-normal tracking-[-0.035em]">{title}</h2><p className="mt-4 max-w-xs text-[11px] leading-6 text-muted">{copy}</p></article>)}
      </section>
      <div className="mt-16 flex flex-wrap items-center gap-5 text-[10px] text-muted">
        <a href="https://testnet.arcscan.app/" target="_blank" rel="noopener noreferrer" aria-label="Built on Arc Testnet (opens in a new tab)" className="transition-colors hover:text-ink">Built on Arc Testnet ↗</a>
        <span aria-hidden="true">·</span>
        <span>Within is currently available as an Arc Testnet Beta.</span>
      </div>
    </main>
  </div>;
}
