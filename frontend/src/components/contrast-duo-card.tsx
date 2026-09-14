import type { ReactNode } from "react"

// Harvested from upstage-sixsense .duo contrast cards (sixsense.askewly.com),
// 2026-08-04 (docs/design-system/harvest-contract.md §4).

export type ContrastCard = {
  /** Small muted eyebrow, e.g. "지금은" / "한입지도라면". */
  label: string
  headline: string
  body?: string
  /** Optional visual band under the copy (image, mini demo, illustration). */
  visual?: ReactNode
  /** Inverted card gets the ink treatment for contrast. */
  inverted?: boolean
}

/**
 * Contrast duo card: a before/after (or problem/answer) pair told as two
 * cards with identical internal hierarchy — muted label, bold headline,
 * supporting line, optional visual band. The rhythm repeating across both
 * cards is what makes the contrast legible; one card may invert onto the
 * foreground ground to sharpen the "after". Not a feature grid — exactly two
 * sides of one comparison.
 */
export function ContrastDuoCard({ cards }: { cards: [ContrastCard, ContrastCard] }) {
  return (
    <div className="grid w-full max-w-3xl gap-4 md:grid-cols-2">
      {cards.map((card) => (
        <article
          key={card.label + card.headline}
          className={
            card.inverted
              ? "flex flex-col overflow-hidden rounded-lg bg-foreground p-6 text-background"
              : "flex flex-col overflow-hidden rounded-lg border bg-card p-6 text-card-foreground"
          }
        >
          <p
            className={
              card.inverted
                ? "text-xs font-medium uppercase tracking-widest text-background/60"
                : "text-xs font-medium uppercase tracking-widest text-muted-foreground"
            }
          >
            {card.label}
          </p>
          <h3 className="mt-2 break-keep text-lg font-semibold leading-snug">{card.headline}</h3>
          {card.body ? (
            <p className={card.inverted ? "mt-2 break-keep text-sm leading-relaxed text-background/75" : "mt-2 break-keep text-sm leading-relaxed text-muted-foreground"}>
              {card.body}
            </p>
          ) : null}
          {card.visual ? <div className="mt-4 flex-1">{card.visual}</div> : null}
        </article>
      ))}
    </div>
  )
}
