import { CheckIcon } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"

type PricingTier = {
  name: string
  price: string
  period: string
  blurb: string
  features: string[]
  cta: string
  highlighted: boolean
}

type PricingSectionProps = {
  eyebrow: string
  heading: string
  tiers: PricingTier[]
}

/** Three-tier pricing: identical card anatomy, the highlighted tier carries the primary treatment. */
export function PricingSection({ eyebrow, heading, tiers }: PricingSectionProps) {
  return (
    <section className="mx-auto w-full max-w-5xl px-6 py-20">
      <p className="mb-2 text-center text-xs font-medium uppercase tracking-widest text-muted-foreground">{eyebrow}</p>
      <h2 className="mb-10 break-keep text-center text-2xl font-semibold tracking-tight text-foreground">{heading}</h2>
      <div className="grid gap-6 md:grid-cols-3">
        {tiers.map((tier) => (
          <article
            key={tier.name}
            className={`flex flex-col rounded-xl border bg-card p-6 text-card-foreground ${
              tier.highlighted ? "border-primary shadow-sm" : ""
            }`}
          >
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-foreground">{tier.name}</h3>
              {tier.highlighted ? <Badge>Popular</Badge> : null}
            </div>
            <p className="text-3xl font-semibold tracking-tight text-foreground">
              {tier.price}
              <span className="ml-1 text-sm font-normal text-muted-foreground">{tier.period}</span>
            </p>
            <p className="mt-2 text-sm text-muted-foreground">{tier.blurb}</p>
            <ul className="mt-6 flex-1 space-y-2">
              {tier.features.map((feature) => (
                <li key={feature} className="flex items-start gap-2 text-sm text-foreground">
                  <CheckIcon aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-primary" />
                  {feature}
                </li>
              ))}
            </ul>
            <Button className="mt-6" variant={tier.highlighted ? "default" : "outline"}>
              {tier.cta}
            </Button>
          </article>
        ))}
      </div>
    </section>
  )
}
