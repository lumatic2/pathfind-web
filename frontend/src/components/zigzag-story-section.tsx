import type { ReactNode } from "react"

// Harvested from Askwely-company (askewly.com) building-section — zigzag
// storytelling rows, 2026-08-04 (docs/design-system/harvest-contract.md §4).
// Brand illustrations stay with the origin project; media is a consumer slot.

export type ZigzagStep = {
  title: string
  body: string
  /** Visual for this step (image, illustration, demo). Falls back to a numbered placeholder panel. */
  media?: ReactNode
}

type ZigzagStorySectionProps = {
  eyebrow?: string
  heading: string
  steps: ZigzagStep[]
}

/**
 * Zigzag story section: a narrative sequence told as alternating copy/media
 * rows — copy left on even rows, right on odd — so a long "how we work"
 * story reads as a walk, not a wall. Each row is one step; order carries
 * meaning (it is a journey, not a feature grid). On small screens rows
 * stack copy-first so the argument stays readable without the visuals.
 */
export function ZigzagStorySection({ eyebrow, heading, steps }: ZigzagStorySectionProps) {
  return (
    <section className="w-full max-w-4xl">
      <div className="mb-10">
        {eyebrow ? (
          <p className="mb-2 text-xs font-medium uppercase tracking-widest text-muted-foreground">{eyebrow}</p>
        ) : null}
        <h2 className="break-keep text-2xl font-semibold tracking-tight text-foreground">{heading}</h2>
      </div>
      <ol className="space-y-12">
        {steps.map((step, index) => {
          const mediaFirst = index % 2 === 1
          return (
            <li key={step.title} className="grid items-center gap-6 md:grid-cols-2 md:gap-10">
              <div className={mediaFirst ? "md:order-2" : undefined}>
                <h3 className="break-keep text-lg font-semibold text-foreground">{step.title}</h3>
                <p className="mt-2 break-keep text-sm leading-relaxed text-muted-foreground">{step.body}</p>
              </div>
              <div className={mediaFirst ? "md:order-1" : undefined}>
                {/* No border on the placeholder: it is a slot waiting for the
                    consumer's media, and a framed empty box reads as finished
                    content (M28 step-3, owner observation). */}
                {step.media ?? (
                  <div
                    aria-hidden="true"
                    className="flex aspect-[3/2] w-full items-center justify-center rounded-lg bg-muted"
                  >
                    <span className="text-3xl font-semibold tabular-nums text-muted-foreground/60">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                  </div>
                )}
              </div>
            </li>
          )
        })}
      </ol>
    </section>
  )
}
