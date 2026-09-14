import * as React from 'react';
import { cn } from '@/lib/utils';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'primary';
  size?: 'default' | 'sm' | 'lg';
}

export function Button({ className, variant = 'default', size = 'default', ...props }: ButtonProps) {
  const base = 'inline-flex items-center justify-center rounded-md whitespace-nowrap text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50';
  const variants = {
    default: 'bg-primary text-primary-foreground hover:bg-primary/90 ring-offset-background',
    primary: 'bg-foreground text-background hover:bg-foreground/90',
  };
  const sizes = {
    default: 'h-9 px-4 py-2',
    sm: 'h-8 rounded-md px-3 text-xs',
    lg: 'h-10 rounded-md px-8',
  };
  return (
    <button className={cn(base, variants[variant], sizes[size], className)} {...props} />
  );
}
