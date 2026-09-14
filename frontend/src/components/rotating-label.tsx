import { useEffect, useState } from "react"

// Harvested from ai-bootcamp-2026 rotating-label (bootcamp.askewly.com), 2026-08-04
// (docs/design-system/harvest-contract.md §4). aria-live mirror added on promotion.

type RotatingLabelProps = {
  labels: string[]
  /** ms per label. Also the CSS animation duration, so swap and hold stay in sync. */
  intervalMs?: number
  /** Fixed slot width in ch — keeps layout still while label lengths change. */
  widthCh?: number
}

/**
 * Rotating label: one word slot inside a headline cycles through values
 * ("M" → "95" → "XL"). The swap trick is a React `key` remount — each index
 * change mounts a fresh span whose CSS keyframe plays rise-in/rise-out once,
 * so there is no JS tween. A fixed `ch` width prevents layout shift between
 * short and long labels, and a visually-hidden live region mirrors the value
 * for screen readers. Under `prefers-reduced-motion` labels switch with no
 * animation.
 */
export function RotatingLabel({ labels, intervalMs = 1800, widthCh = 3.4 }: RotatingLabelProps) {
  const [index, setIndex] = useState(0)

  useEffect(() => {
    if (labels.length < 2) return
    const id = setInterval(() => setIndex((i) => (i + 1) % labels.length), intervalMs)
    return () => clearInterval(id)
  }, [labels.length, intervalMs])

  if (labels.length === 0) return null
  return (
    <span className="inline-grid place-items-center overflow-hidden align-baseline" style={{ width: `${widthCh}ch` }}>
      <span
        key={index}
        className="inline-block animate-[label-swap_ease-in-out_both] motion-reduce:animate-none"
        style={{ animationDuration: `${intervalMs}ms` }}
        aria-hidden="true"
      >
        {labels[index]}
      </span>
      <span className="sr-only" aria-live="polite">
        {labels[index]}
      </span>
      <style>{`@keyframes label-swap { 0% { opacity: 0; transform: translateY(0.5em); } 18%, 82% { opacity: 1; transform: translateY(0); } 100% { opacity: 0; transform: translateY(-0.5em); } }`}</style>
    </span>
  )
}
