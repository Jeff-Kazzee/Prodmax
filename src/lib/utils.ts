import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** Merge Tailwind class lists, last class wins. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
