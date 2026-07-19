import type { HTMLAttributes, ReactNode } from "react";

export function Card({ children, className = "", padding = "md", ...props }: HTMLAttributes<HTMLDivElement> & { children: ReactNode; padding?: "none" | "md" | "lg" }) {
  const spacing = { none: "", md: "p-5", lg: "p-7" }[padding];
  return <div className={`rounded-card border border-border bg-surface shadow-hairline ${spacing} ${className}`} {...props}>{children}</div>;
}
