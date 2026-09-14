import { Button } from "@/components/ui/button"
import { FloatingBarsHero } from "@/components/floating-bars-hero"

type HeroSectionProps = {
  title: string
  description: string
  primaryCta: string
  primaryHref?: string
  secondaryCta: string
  secondaryHref?: string
}

/** Opening screen: floating-bars hero with the block's two-action CTA slot. */
export function HeroSection({ title, description, primaryCta, primaryHref, secondaryCta, secondaryHref }: HeroSectionProps) {
  return (
    <FloatingBarsHero
      title={title}
      description={description}
      actions={
        <div className="flex flex-wrap items-center justify-center gap-3">
          {primaryHref ? (
            <a href={primaryHref}>
              <Button size="lg">{primaryCta}</Button>
            </a>
          ) : (
            <Button size="lg">{primaryCta}</Button>
          )}
          {secondaryHref ? (
            <a href={secondaryHref}>
              <Button size="lg" variant="outline">
                {secondaryCta}
              </Button>
            </a>
          ) : (
            <Button size="lg" variant="outline">
              {secondaryCta}
            </Button>
          )}
        </div>
      }
    />
  )
}
