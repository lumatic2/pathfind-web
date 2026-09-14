import type { ReactNode } from "react"

const REVEAL_CSS = `
@supports (animation-timeline: view()) {
  .sdr-item {
    animation: sdr-reveal both;
    animation-timeline: view();
    animation-range: entry 0% entry 70%;
  }
  @keyframes sdr-reveal {
    from { opacity: 0; transform: translateY(1.25rem); }
    to { opacity: 1; transform: none; }
  }
}
@media (prefers-reduced-motion: reduce) {
  .sdr-item { animation: none; }
}
`

type ScrollDrivenRevealProps = {
  children: ReactNode
  className?: string
}

/**
 * Scroll-driven reveal: items fade/rise in as they enter the scrollport,
 * driven entirely by CSS view-progress timelines (tier ① — no scroll
 * listeners, no IntersectionObserver, off-main-thread). The hidden initial
 * state exists ONLY inside @supports (animation-timeline: view()), so
 * unsupported browsers and reduced-motion users always see the content —
 * reveal failure must never become content loss.
 */
export function ScrollDrivenRevealItem({ children, className }: ScrollDrivenRevealProps) {
  return (
    <div className={`sdr-item ${className ?? ""}`}>
      <style>{REVEAL_CSS}</style>
      {children}
    </div>
  )
}

/** Colocated demo: a bounded scrollport where cards reveal on entry — scroll to observe. */
export function ScrollDrivenRevealDemo() {
  return (
    <div className="h-64 w-full max-w-md overflow-y-auto rounded-lg border bg-background p-4">
      <p className="mb-4 text-sm text-muted-foreground">Scroll down — cards reveal as they enter the scrollport.</p>
      <div className="space-y-4">
        {["Declarative", "Off the main thread", "No listeners", "Progressive", "한국어 카피도 자연스럽게 줄바꿈됩니다"].map((label, index) => (
          <ScrollDrivenRevealItem key={index}>
            <div className="rounded-md border bg-muted/40 px-4 py-6">
              <p className="break-keep text-sm font-medium text-foreground">{label}</p>
              <p className="mt-1 break-keep text-sm text-muted-foreground">animation-timeline: view() — 진입 구간 0~70%에서 나타납니다.</p>
            </div>
          </ScrollDrivenRevealItem>
        ))}
      </div>
    </div>
  )
}
