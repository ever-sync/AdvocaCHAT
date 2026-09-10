import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function safeParseMs(dateStr: string | null | undefined): number {
  if (!dateStr) return 0;
  const trimmed = dateStr.trim();
  const normalized = trimmed.replace(/^(\d{4}-\d{2}-\d{2})\s(\d{2}:\d{2}:\d{2})/, "$1T$2");
  const parsed = Date.parse(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}
