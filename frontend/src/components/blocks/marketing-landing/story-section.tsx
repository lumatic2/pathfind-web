import { ZigzagStorySection, type ZigzagStep } from "@/components/zigzag-story-section"

type StorySectionProps = {
  eyebrow: string
  heading: string
  steps: Array<{ title: string; body: string }>
}

/**
 * "How it works" narrative: zigzag rows walk the visitor through the product
 * loop. Every step uses the asset's own placeholder panel — the media slot is
 * the consumer's (screenshots, short clips), and the block leaves it empty
 * rather than shipping decoration the consumer has to remove first.
 *
 * The first step used to carry a bespoke mesh-gradient card. It went away on
 * owner observation (M28 step-3): a decorated, bordered panel reads as the
 * finished visual, and anything dropped into it lands inside a second frame.
 */
export function StorySection({ eyebrow, heading, steps }: StorySectionProps) {
  const zigzagSteps: ZigzagStep[] = steps.map((step) => ({ ...step }))

  return (
    <section className="mx-auto flex w-full max-w-5xl justify-center px-6 py-20">
      <ZigzagStorySection eyebrow={eyebrow} heading={heading} steps={zigzagSteps} />
    </section>
  )
}
