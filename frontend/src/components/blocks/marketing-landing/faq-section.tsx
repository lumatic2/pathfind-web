import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"

type FaqSectionProps = {
  eyebrow: string
  heading: string
  items: Array<{ question: string; answer: string }>
}

/** Objection queue as an accordion — ordered by what buyers actually worry about. */
export function FaqSection({ eyebrow, heading, items }: FaqSectionProps) {
  return (
    <section className="mx-auto w-full max-w-3xl px-6 py-20">
      <p className="mb-2 text-center text-xs font-medium uppercase tracking-widest text-muted-foreground">{eyebrow}</p>
      <h2 className="mb-8 break-keep text-center text-2xl font-semibold tracking-tight text-foreground">{heading}</h2>
      <Accordion collapsible type="single">
        {items.map((item) => (
          <AccordionItem key={item.question} value={item.question}>
            <AccordionTrigger className="text-left text-sm font-medium">{item.question}</AccordionTrigger>
            <AccordionContent className="text-sm leading-relaxed text-muted-foreground">{item.answer}</AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </section>
  )
}
