import { LogoMarquee } from "@/components/logo-marquee"

type LogoStripSectionProps = {
  caption: string
  logos: string[]
}

/** Trust strip directly under the hero: caption + seamless logo marquee. */
export function LogoStripSection({ caption, logos }: LogoStripSectionProps) {
  return (
    <section className="mx-auto w-full max-w-5xl px-6 py-12">
      <p className="mb-6 text-center text-xs font-medium uppercase tracking-widest text-muted-foreground">{caption}</p>
      <LogoMarquee items={logos} />
    </section>
  )
}
