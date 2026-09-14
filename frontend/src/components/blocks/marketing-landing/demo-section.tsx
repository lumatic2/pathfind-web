import { StaggeredEntranceGroup } from "@/components/staggered-entrance-group"
import { TerminalDemoPanel, type TerminalScene } from "@/components/terminal-demo-panel"

type DemoSectionProps = {
  eyebrow: string
  heading: string
  body: string
  capabilities: string[]
  scenes: TerminalScene[]
}

/**
 * Proof by demonstration: copy and a staggered capability list on one side,
 * the self-playing terminal demo on the other — the visitor watches the
 * product loop instead of reading about it.
 */
export function DemoSection({ eyebrow, heading, body, capabilities, scenes }: DemoSectionProps) {
  return (
    <section className="mx-auto w-full max-w-5xl px-6 py-20">
      <div className="grid items-start gap-10 lg:grid-cols-[2fr_3fr]">
        <div>
          <p className="mb-2 text-xs font-medium uppercase tracking-widest text-muted-foreground">{eyebrow}</p>
          <h2 className="break-keep text-2xl font-semibold tracking-tight text-foreground">{heading}</h2>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{body}</p>
          <div className="mt-6">
            <StaggeredEntranceGroup items={capabilities} />
          </div>
        </div>
        <TerminalDemoPanel scenes={scenes} />
      </div>
    </section>
  )
}
