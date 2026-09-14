import { useEffect, useRef, useState } from "react"
import { GlobeIcon, PauseIcon, PlayIcon } from "lucide-react"

// Harvested from ai-guide (guide.askewly.com) TerminalDemo — auto-playing
// terminal→result dual pane, 2026-08-04 (docs/design-system/harvest-contract.md §4).

export type TerminalScene = {
  /** The command a user "types" into the terminal. */
  prompt: string
  /** Streamed response lines. Lines starting with "✓" render as success. */
  lines: string[]
  /** What opens in the result pane when the run completes. */
  result: { address: string; label: string }
}

type TerminalDemoPanelProps = {
  scenes: TerminalScene[]
  /** ms per typed character. */
  typeInterval?: number
  /** ms per streamed line. */
  lineInterval?: number
  /** ms the finished result stays open before the next scene. */
  resultHold?: number
}

const DEFAULTS = { typeInterval: 55, lineInterval: 320, resultHold: 3200 }

/**
 * Terminal demo panel: a self-playing two-pane pitch — a terminal that types
 * a command, streams its response, then slides a browser-style result pane
 * open beside it. It compresses "you ask, it ships" into one loop the
 * visitor can watch instead of read. Playback is pausable, and under
 * `prefers-reduced-motion` every scene renders in its finished state with
 * no typing animation.
 */
export function TerminalDemoPanel({ scenes, typeInterval, lineInterval, resultHold }: TerminalDemoPanelProps) {
  const speed = {
    type: typeInterval ?? DEFAULTS.typeInterval,
    line: lineInterval ?? DEFAULTS.lineInterval,
    hold: resultHold ?? DEFAULTS.resultHold,
  }
  const [reducedMotion, setReducedMotion] = useState(false)
  const [playing, setPlaying] = useState(true)
  const [sceneIndex, setSceneIndex] = useState(0)
  const [typedCount, setTypedCount] = useState(0)
  const [lineCount, setLineCount] = useState(0)
  const [resultOpen, setResultOpen] = useState(false)
  const timeouts = useRef<ReturnType<typeof setTimeout>[]>([])

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)")
    const apply = () => setReducedMotion(query.matches)
    apply()
    query.addEventListener("change", apply)
    return () => query.removeEventListener("change", apply)
  }, [])

  useEffect(() => {
    if (!playing || scenes.length === 0) return
    const scene = scenes[sceneIndex % scenes.length]
    const later = (fn: () => void, ms: number) => timeouts.current.push(setTimeout(fn, ms))

    if (reducedMotion) {
      setTypedCount(scene.prompt.length)
      setLineCount(scene.lines.length)
      setResultOpen(true)
      later(() => advance(), speed.hold + 1600)
      return cleanup
    }

    setTypedCount(0)
    setLineCount(0)
    setResultOpen(false)
    for (let i = 1; i <= scene.prompt.length; i++) later(() => setTypedCount(i), 300 + speed.type * i)
    const typed = 300 + speed.type * scene.prompt.length
    scene.lines.forEach((_, i) => later(() => setLineCount(i + 1), typed + speed.line * (i + 1)))
    const streamed = typed + speed.line * scene.lines.length + 700
    later(() => setResultOpen(true), streamed)
    later(() => advance(), streamed + speed.hold)
    return cleanup

    function advance() {
      setSceneIndex((current) => (current + 1) % scenes.length)
    }
    function cleanup() {
      timeouts.current.forEach(clearTimeout)
      timeouts.current = []
    }
    // `scenes` stays out of the deps on purpose: callers pass inline literals, and a
    // fresh identity every render would cancel the pending timers and reset the loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, sceneIndex, reducedMotion])

  if (scenes.length === 0) return null
  const scene = scenes[sceneIndex % scenes.length]

  return (
    <div className="w-full max-w-3xl">
      <div className="grid gap-3 md:grid-cols-2">
        <div className="flex h-72 flex-col overflow-hidden rounded-lg border bg-foreground text-background dark:bg-muted dark:text-foreground">
          <div className="flex items-center gap-2 border-b border-background/15 px-3 py-2">
            <span aria-hidden="true" className="size-2.5 rounded-full bg-background/25 dark:bg-foreground/25" />
            <span aria-hidden="true" className="size-2.5 rounded-full bg-background/25 dark:bg-foreground/25" />
            <span aria-hidden="true" className="size-2.5 rounded-full bg-background/25 dark:bg-foreground/25" />
            <span className="ml-1 font-mono text-xs text-background/60">terminal</span>
            <button
              type="button"
              onClick={() => setPlaying((value) => !value)}
              aria-label={playing ? "Pause demo" : "Play demo"}
              className="ml-auto rounded p-1 text-background/60 hover:text-background dark:text-foreground/60 dark:hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
            >
              {playing ? <PauseIcon className="size-3.5" /> : <PlayIcon className="size-3.5" />}
            </button>
          </div>
          <div aria-live="polite" className="flex-1 overflow-y-auto p-3 font-mono text-xs leading-relaxed">
            <p>
              <span className="text-background/50 dark:text-foreground/50">$ </span>
              {scene.prompt.slice(0, typedCount)}
              {typedCount < scene.prompt.length ? <span className="animate-pulse">▍</span> : null}
            </p>
            <div className="mt-2 space-y-1">
              {scene.lines.slice(0, lineCount).map((line) => (
                <p key={line} className={line.startsWith("✓") ? "text-background dark:text-foreground" : "text-background/70 dark:text-foreground/70"}>
                  {line}
                </p>
              ))}
            </div>
          </div>
        </div>
        <div
          className={
            resultOpen
              ? "flex h-72 flex-col overflow-hidden rounded-lg border bg-background opacity-100 transition-opacity duration-500"
              : "flex h-72 flex-col overflow-hidden rounded-lg border bg-muted opacity-60 transition-opacity duration-500"
          }
        >
          <div className="flex items-center gap-2 border-b px-3 py-2">
            <GlobeIcon aria-hidden="true" className="size-3.5 text-muted-foreground" />
            <span className="truncate rounded bg-muted px-2 py-0.5 font-mono text-xs text-muted-foreground">
              {resultOpen ? scene.result.address : "…"}
            </span>
          </div>
          <div className="flex flex-1 items-center justify-center p-4">
            {resultOpen ? (
              <p className="break-keep text-center text-sm font-medium text-foreground">{scene.result.label}</p>
            ) : (
              <p className="text-center text-xs text-muted-foreground">Result opens here when the run completes</p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
