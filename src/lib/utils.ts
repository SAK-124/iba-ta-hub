import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Standardizes student names to Title Case and cleans up common formatting issues.
 * Examples: "Aamina,Ghias" -> "Aamina Ghias", "ABDUL RAFAY" -> "Abdul Rafay"
 */
export function normalizeName(name: string): string {
  if (!name) return "";

  // Replace comma or other common separators with spaces
  const cleanName = name.replace(/[,/_-]/g, ' ');

  // Split into words, handle casing, and join back
  return cleanName
    .split(/\s+/)
    .map(word => {
      const lower = word.toLowerCase();
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join(' ')
    .trim();
}
