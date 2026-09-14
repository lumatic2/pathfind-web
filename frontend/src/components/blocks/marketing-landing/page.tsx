/**
 * Marketing landing block — standard-funnel composition (block-contract §6):
 * hero → logo strip → story → demo proof → comparison → pricing → FAQ →
 * final CTA → footer. Section order carries the argument (open strong,
 * resolve objections in buyer order, repeat the ask); each section is an
 * independent file, so reordering into other funnel types (proof-first,
 * compressed Z-pattern) is a matter of moving lines here — see the
 * rearrangement guide in the block's contract entry. Copy, logos, and
 * pricing live in data.json — the consumer's first edit surface.
 */
import { ScrollDrivenRevealItem } from "@/components/scroll-driven-reveal"
import { CtaSection } from "./cta-section"
import { ComparisonSection } from "./comparison-section"
import { DemoSection } from "./demo-section"
import { FaqSection } from "./faq-section"
import { FooterSection } from "./footer-section"
import { HeroSection } from "./hero-section"
import { LogoStripSection } from "./logo-strip-section"
import { PricingSection } from "./pricing-section"
import { StorySection } from "./story-section"
import data from "./data.json"

export function MarketingLandingPage() {
  return (
    <main className="w-full bg-background text-foreground">
      <HeroSection {...data.hero} />
      <LogoStripSection {...data.logoStrip} />
      <ScrollDrivenRevealItem>
        <StorySection {...data.story} />
      </ScrollDrivenRevealItem>
      <ScrollDrivenRevealItem>
        <DemoSection {...data.demo} />
      </ScrollDrivenRevealItem>
      <ScrollDrivenRevealItem>
        <ComparisonSection {...data.comparison} />
      </ScrollDrivenRevealItem>
      <ScrollDrivenRevealItem>
        <PricingSection {...data.pricing} />
      </ScrollDrivenRevealItem>
      <ScrollDrivenRevealItem>
        <FaqSection {...data.faq} />
      </ScrollDrivenRevealItem>
      <ScrollDrivenRevealItem>
        <CtaSection {...data.cta} />
      </ScrollDrivenRevealItem>
      <FooterSection {...data.footer} />
    </main>
  )
}

/** Zero-prop gallery demo: the full landing page scaled into a bounded, scrollable frame. */
export function MarketingLandingDemo() {
  return (
    <div className="h-[540px] w-full overflow-y-auto rounded-lg border">
      <MarketingLandingPage />
    </div>
  )
}
