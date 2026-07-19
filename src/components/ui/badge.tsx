import type { HTMLAttributes, ReactNode } from "react";

export function Badge({ children, variant = "blue", className = "", ...props }: HTMLAttributes<HTMLSpanElement> & { children: ReactNode; variant?: "blue" | "neutral" | "success" }) {
  const styles = { blue: "bg-accent-soft text-accent", neutral: "bg-[#f0f0ec] text-muted", success: "bg-success-soft text-success" }[variant];
  return <span className={`inline-flex h-6 items-center rounded-full px-2.5 text-[10px] font-medium ${styles} ${className}`} {...props}>{children}</span>;
}
