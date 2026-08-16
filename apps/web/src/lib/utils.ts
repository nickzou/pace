import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

// The shadcn class helper: merge conditional classes (clsx) and de-dupe conflicting
// Tailwind utilities (tailwind-merge, v3 for Tailwind v4). Used by every ui/ component.
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
