import { Button } from "@/components/ui/button"
import { FloatingBarsHero } from "@/components/floating-bars-hero"

type HeroSectionProps = {
  title: string
  description: string
  primaryCta: string
  secondaryCta: string
}

/** Opening screen: floating-bars hero with the block's two-action CTA slot. */
export function HeroSection({ title, description, primaryCta, secondaryCta }: HeroSectionProps) {
  return (
    <FloatingBarsHero
      title={title}
      description={description}
      actions={
        <div className="flex flex-wrap items-center justify-center gap-3">
          <Button size="lg">{primaryCta}</Button>
          <Button size="lg" variant="outline">
            {secondaryCta}
          </Button>
        </div>
      }
    />
  )
}
