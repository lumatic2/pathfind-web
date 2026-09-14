import * as React from 'react';
import * as RadixAccordion from '@radix-ui/react-accordion';

export const Accordion = React.forwardRef<
  React.ComponentRef<typeof RadixAccordion.Root>,
  React.ComponentPropsWithoutRef<typeof RadixAccordion.Root>
>((props, ref) => <RadixAccordion.Root ref={ref} {...props} />);
export const AccordionItem = React.forwardRef<
  React.ComponentRef<typeof RadixAccordion.Item>,
  React.ComponentPropsWithoutRef<typeof RadixAccordion.Item>
>((props, ref) => <RadixAccordion.Item ref={ref} {...props} />);
export const AccordionTrigger = React.forwardRef<
  React.ComponentRef<typeof RadixAccordion.Trigger>,
  React.ComponentPropsWithoutRef<typeof RadixAccordion.Trigger>
>((props, ref) => <RadixAccordion.Trigger ref={ref} {...props} />);
export const AccordionContent = React.forwardRef<
  React.ComponentRef<typeof RadixAccordion.Content>,
  React.ComponentPropsWithoutRef<typeof RadixAccordion.Content>
>((props, ref) => <RadixAccordion.Content ref={ref} {...props} />);
