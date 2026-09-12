import * as React from 'react';
import { cn } from '@/lib/utils';

const DialogContext = React.createContext<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
} | null>(null);

export function Dialog({
  open,
  onOpenChange,
  children,
}: {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  children?: React.ReactNode;
}) {
  const context = React.useContext(DialogContext);
  const controlled = open !== undefined;
  const [internalOpen, setInternalOpen] = React.useState(false);
  const openState = controlled ? open : internalOpen;
  const onOpenChange = React.useCallback(
    (next: boolean) => {
      if (!controlled) setInternalOpen(next);
      onOpenChange?.(next);
    },
    [controlled, onOpenChange]
  );
  const value = context ?? { open: openState, onOpenChange };
  return (
    <DialogContext.Provider value={value}>
      {React.Children.only(children)}
    </DialogContext.Provider>
  );
}

export function DialogContent({
  children,
  showCloseButton = true,
  className,
  ...props
}: {
  children?: React.ReactNode;
  showCloseButton?: boolean;
  className?: string;
  [key: string]: unknown;
}) {
  const { open, onOpenChange } = React.useContext(DialogContext)!;
  return (
    <div
      role="dialog"
      aria-modal="true"
      className={cn(
        'fixed inset-0 z-50 flex items-center justify-center',
        className
      )}
      {...props}
    >
      <div className="fixed inset-0 bg-foreground/50" onClick={() => onOpenChange(false)} />
      <div className="relative z-10 flex max-h-[calc(100%-2rem)] w-full max-w-none flex-col overflow-auto rounded-xl bg-card p-4 shadow-lg">
        {showCloseButton && (
          <button
            type="button"
            className="absolute right-3 top-3 rounded-md p-1 text-foreground/60 hover:bg-foreground/10 hover:text-foreground/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onClick={() => onOpenChange(false)}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        )}
        {children}
      </div>
    </div>
  );
}

export function DialogTitle({ children, className, ...props }: { children?: React.ReactNode; className?: string; [key: string]: unknown }) {
  return (
    <div
      role="heading"
      aria-level={2}
      className={cn('text-lg font-semibold leading-none tracking-tight', className)}
      {...props}
    >
      {children}
    </div>
  );
}

export function DialogDescription({ children, className, ...props }: { children?: React.ReactNode; className?: string; [key: string]: unknown }) {
  return (
    <p className={cn('text-sm text-foreground/60', className)} {...props}>
      {children}
    </p>
  );
}
