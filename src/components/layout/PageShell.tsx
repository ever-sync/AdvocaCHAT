import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Largura máxima do conteúdo principal (design system AdvocaCHAT). */
export const PAGE_MAX_WIDTH_CLASS = "max-w-page";

export const pageShellClasses = {
  root: "min-h-0 min-w-0 flex-1 overflow-y-auto bg-background px-4 py-6 pb-24 md:px-6 md:pb-8 xl:px-8",
  content: `mx-auto w-full ${PAGE_MAX_WIDTH_CLASS}`,
} as const;

type PageShellProps = {
  children: ReactNode;
  className?: string;
  contentClassName?: string;
};

export function PageShell({ children, className, contentClassName }: PageShellProps) {
  return (
    <div className={cn(pageShellClasses.root, className)}>
      <div className={cn(pageShellClasses.content, contentClassName)}>{children}</div>
    </div>
  );
}
