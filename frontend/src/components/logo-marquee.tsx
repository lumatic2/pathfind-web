// Harvested from ai-bootcamp-2026 brand-marquee (bootcamp.askewly.com), 2026-08-04
// (docs/design-system/harvest-contract.md §4).

type LogoMarqueeProps = {
  /** Names (or short labels) to loop. */
  items: string[]
  /** Seconds per item — total duration scales with count so perceived speed stays constant. */
  secondsPerItem?: number
}

/**
 * Logo marquee: an infinite horizontal strip of brand names. The list is
 * doubled and translated 0 → -50% so the loop has no visible seam, duration
 * scales with item count so adding brands never speeds the strip up, edges
 * fade out with a mask, hover pauses the run, and `prefers-reduced-motion`
 * stops it entirely. Pure CSS animation — no JS timers.
 *
 * The pause uses `group`/`group-hover` rather than a stacked `hover:[&>div]:`
 * variant: stacked variants apply right to left, so that form resolved to
 * `.strip > div:hover` and the run did not pause from the strip itself
 * (M28 step-3, user-observed). The track is wider than its clip, so keying
 * the hover to the container is also the behaviour a reader expects.
 */
export function LogoMarquee({ items, secondsPerItem = 1.15 }: LogoMarqueeProps) {
  if (items.length === 0) return null
  return (
    <div
      className="group mx-auto w-full max-w-2xl overflow-hidden [mask-image:linear-gradient(to_right,transparent,black_10%,black_90%,transparent)]"
      aria-label={`Featured: ${items.join(", ")}`}
    >
      <div
        className="flex w-max items-center gap-8 animate-[marquee-x_linear_infinite] group-hover:[animation-play-state:paused] motion-reduce:animate-none"
        style={{ animationDuration: `${Math.max(8, Math.round(items.length * secondsPerItem * 2))}s` }}
      >
        {[...items, ...items].map((name, index) => (
          <span
            key={`${name}-${index}`}
            aria-hidden={index >= items.length}
            className="whitespace-nowrap text-sm font-medium uppercase tracking-widest text-muted-foreground"
          >
            {name}
          </span>
        ))}
      </div>
      <style>{`@keyframes marquee-x { from { transform: translateX(0); } to { transform: translateX(-50%); } }`}</style>
    </div>
  )
}
