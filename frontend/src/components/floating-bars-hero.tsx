import type { ReactNode } from "react"

// Harvested from ui.askewly.com landing hero + FloatingField bar decoration,
// 2026-08-04 (docs/design-system/harvest-contract.md §4). Grid/bar colors are
// token-derived (color-mix over --foreground/--primary) — no literals.

type FloatingBar = {
  id: string
  /** Tailwind positioning + size classes, e.g. "left-[7%] top-[16%] h-28 w-8". */
  className: string
  tone: "deep" | "mid" | "soft" | "pale"
}

type FloatingBarsHeroProps = {
  title: string
  description?: string
  /** Call-to-action area (buttons, search bar). */
  actions?: ReactNode
  /** Scattered decoration bars. Defaults to a balanced 12-bar field. */
  bars?: FloatingBar[]
}

const DEFAULT_BARS: FloatingBar[] = [
  { id: "a", className: "left-[7%] top-[16%] hidden h-28 w-8 xl:block", tone: "deep" },
  { id: "b", className: "left-[10%] top-[38%] hidden h-8 w-4 md:block", tone: "deep" },
  { id: "c", className: "right-[9%] top-[32%] hidden h-12 w-7 lg:block", tone: "deep" },
  { id: "d", className: "right-[12%] top-[14%] hidden h-20 w-5 lg:block", tone: "pale" },
  { id: "e", className: "left-[3%] top-[26%] hidden h-12 w-2 xl:block", tone: "soft" },
  { id: "f", className: "right-[20%] top-[24%] hidden h-16 w-5 xl:block", tone: "mid" },
  { id: "g", className: "left-[16%] top-[58%] hidden h-6 w-6 md:block", tone: "mid" },
  { id: "h", className: "right-[30%] top-[52%] hidden h-12 w-2 md:block", tone: "soft" },
  { id: "i", className: "left-[22%] top-[74%] hidden h-9 w-3 lg:block", tone: "pale" },
  { id: "j", className: "right-[16%] top-[70%] hidden h-14 w-4 lg:block", tone: "soft" },
  { id: "k", className: "left-[36%] top-[84%] hidden h-16 w-2 xl:block", tone: "soft" },
  { id: "l", className: "right-[38%] top-[80%] hidden h-10 w-3 xl:block", tone: "pale" },
]

const TONE_CLASS: Record<FloatingBar["tone"], string> = {
  deep: "bg-foreground/80",
  mid: "bg-foreground/45",
  soft: "bg-foreground/20",
  pale: "bg-primary/25",
}

/**
 * Floating bars hero: a centered hero (balanced title, supporting line,
 * action slot) over a field of scattered vertical bars and a faint plus-grid.
 * The bars are positioned data, not markup — pass your own coordinate set to
 * re-compose the field. Everything is decoration (`aria-hidden`), tones map
 * to foreground/primary mixes so light and dark grounds both work, and the
 * field fades out toward the content below.
 */
export function FloatingBarsHero({ title, description, actions, bars = DEFAULT_BARS }: FloatingBarsHeroProps) {
  return (
    <section className="relative w-full overflow-hidden py-24 md:py-32">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        <div
          className="absolute inset-0 opacity-30"
          style={{
            backgroundImage: [
              "linear-gradient(color-mix(in srgb, var(--foreground) 5%, transparent) 1px, transparent 1px)",
              "linear-gradient(90deg, color-mix(in srgb, var(--foreground) 4%, transparent) 1px, transparent 1px)",
              "linear-gradient(color-mix(in srgb, var(--foreground) 8%, transparent) 1px, transparent 1px)",
              "linear-gradient(90deg, color-mix(in srgb, var(--foreground) 8%, transparent) 1px, transparent 1px)",
            ].join(", "),
            backgroundSize: "18.6px 18.6px, 18.6px 18.6px, 112px 112px, 112px 112px",
          }}
        />
        {bars.map((bar) => (
          <span key={bar.id} className={`absolute rounded-sm ${TONE_CLASS[bar.tone]} ${bar.className}`} />
        ))}
        <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-b from-transparent to-background" />
      </div>
      <div className="relative z-10 mx-auto max-w-2xl px-6 text-center">
        <h1 className="break-keep text-4xl font-semibold tracking-tight text-foreground [text-wrap:balance] md:text-5xl">{title}</h1>
        {description ? (
          <p className="mx-auto mt-4 max-w-xl break-keep text-base leading-relaxed text-muted-foreground">{description}</p>
        ) : null}
        {actions ? <div className="mt-8 flex flex-wrap items-center justify-center gap-3">{actions}</div> : null}
      </div>
    </section>
  )
}
