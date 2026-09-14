import { useState } from "react"
import { motion, useReducedMotion } from "motion/react"
import { Button } from "@/components/ui/button"

type StaggeredEntranceGroupProps = {
  items: string[]
  /** Delay between item starts, in seconds. Keep tight (≤0.06) — rhythm, not a parade. */
  interval?: number
}

/**
 * Staggered entrance group: children animate in with tightly offset start
 * times so the eye reads one coherent arrival instead of a simultaneous pop
 * (tier ② when the item count is dynamic; static lists can do the same with
 * CSS animation-delay). Reduced motion renders everything immediately visible
 * with no movement — choreography is presentation, never gating.
 */
export function StaggeredEntranceGroup({ items, interval = 0.05 }: StaggeredEntranceGroupProps) {
  const reduceMotion = useReducedMotion()

  return (
    <motion.ul
      animate="show"
      className="space-y-2"
      initial={reduceMotion ? false : "hidden"}
      variants={{ show: { transition: { staggerChildren: interval } } }}
    >
      {items.map((label) => (
        <motion.li
          key={label}
          className="rounded-md border bg-background px-4 py-3"
          transition={{ type: "spring", stiffness: 420, damping: 32 }}
          variants={{ hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0 } }}
        >
          <p className="break-keep text-sm text-foreground">{label}</p>
        </motion.li>
      ))}
    </motion.ul>
  )
}

/** Colocated demo: replay button remounts the group so the stagger is observable on demand. */
export function StaggeredEntranceGroupDemo() {
  const [runId, setRunId] = useState(0)
  const items = ["Stable header first", "Then the content rows", "중요한 행동 버튼은 마지막에", "20~60ms 간격이면 충분합니다"]

  return (
    <div className="w-full max-w-md rounded-lg border bg-muted/30 p-4">
      <Button data-demo-control className="mb-4" size="sm" type="button" variant="outline" onClick={() => setRunId((id) => id + 1)}>
        Replay entrance
      </Button>
      <StaggeredEntranceGroup key={runId} items={items} />
    </div>
  )
}
