import * as React from 'react';
import { cn } from '@/lib/utils';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'primary' | 'outline' | 'link';
  size?: 'default' | 'sm' | 'lg';
  /** 있으면 같은 모양의 `<a>` 로 그린다(랜딩 CTA — 2026-09-14). */
  href?: string;
}

export function Button({ className, variant = 'default', size = 'default', href, ...props }: ButtonProps) {
  const base = 'inline-flex items-center justify-center rounded-md whitespace-nowrap text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50';
  const variants = {
    default: 'bg-primary text-primary-foreground hover:bg-primary/90 ring-offset-background',
    primary: 'bg-foreground text-background hover:bg-foreground/90',
    // 랜딩 블록(marketing-landing hero)이 쓰는 테두리 변종
    outline: 'border border-border bg-background text-foreground hover:bg-muted ring-offset-background',
    // 레지스트리 자산(chat-conversation-panel)이 쓰는 텍스트 전용 변종
    link: 'text-primary underline-offset-4 hover:underline ring-offset-background',
  };
  const sizes = {
    default: 'h-9 px-4 py-2',
    sm: 'h-8 rounded-md px-3 text-xs',
    lg: 'h-10 rounded-md px-8',
  };
  const classes = cn(base, variants[variant], sizes[size], className);
  if (href) {
    return <a className={classes} href={href}>{props.children}</a>;
  }
  return <button className={classes} {...props} />;
}
