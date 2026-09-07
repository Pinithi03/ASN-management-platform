/**
 * Utility for merging Tailwind CSS classes.
 *
 * Combines clsx (conditional classes) with tailwind-merge
 * (deduplication of conflicting Tailwind utilities).
 *
 * Usage: cn("px-4 py-2", isActive && "bg-blue-500", className)
 */

import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
