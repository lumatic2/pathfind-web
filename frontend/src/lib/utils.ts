import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: clsx.Classes[]) {
  return twMerge(clsx(inputs));
}
