import { ContrastDuoCard, type ContrastCard } from "@/components/contrast-duo-card"

type ComparisonSide = {
  label: string
  headline: string
  body: string
}

type ComparisonSectionProps = {
  eyebrow: string
  heading: string
  before: ComparisonSide
  after: ComparisonSide
}

/** Objection handling as one sharp before/after pair — the "after" card inverts for emphasis. */
export function ComparisonSection({ eyebrow, heading, before, after }: ComparisonSectionProps) {
  const cards: [ContrastCard, ContrastCard] = [
    { ...before },
    { ...after, inverted: true },
  ]

  return (
    <section className="mx-auto flex w-full max-w-5xl flex-col items-center px-6 py-20">
      <p className="mb-2 text-xs font-medium uppercase tracking-widest text-muted-foreground">{eyebrow}</p>
      <h2 className="mb-10 break-keep text-center text-2xl font-semibold tracking-tight text-foreground">{heading}</h2>
      <ContrastDuoCard cards={cards} />
    </section>
  )
}
