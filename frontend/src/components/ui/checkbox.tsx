import * as React from 'react';
import * as RadixCheckbox from '@radix-ui/react-checkbox';

export const Checkbox = React.forwardRef<
  React.ComponentRef<typeof RadixCheckbox.Root>,
  React.ComponentPropsWithoutRef<typeof RadixCheckbox.Root> & { className?: string }
>(({ className, ...props }, ref) => (
  <RadixCheckbox.Root
    ref={ref}
    className={`inline-flex h-4 w-4 shrink-0 appearance-none rounded border-2 border-foreground/40 bg-transparent align-middle transition-[width,height,border-color,background-color] outline-none ring-ring ring-offset-2 ring-offset-background focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-primary data-[state=checked]:border-primary data-[state=checked]:text-background`}
    {...props}
  >
    <svg viewBox="0 0 14 14" width="14" height="14" fill="none" className="pointer-events-none text-current">
      <path d="M11 3.667L5.5 9.167 3 6.667 11 3.667Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  </RadixCheckbox.Root>
));
Checkbox.displayName = 'Checkbox';
