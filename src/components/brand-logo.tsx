import type { SVGProps } from "react";

export function WithinMark({ className = "size-8", ...props }: SVGProps<SVGSVGElement>) {
  return <svg viewBox="0 0 48 40" className={className} aria-hidden="true" fill="none" {...props}>
    <path d="M3.7 6.2c-.6-1.3.3-2.7 1.7-2.7h7.1c1.2 0 2.3.7 2.8 1.8l11 24.7-4.6 7.2c-1.2 1.8-4 1.6-4.9-.4L3.7 6.2Z" fill="currentColor"/>
    <path d="M19.4 6.2c-.6-1.3.3-2.7 1.7-2.7h6.4c1.2 0 2.3.7 2.8 1.8l7 15.9-5.4 9.1L19.4 6.2Z" fill="currentColor" opacity=".96"/>
    <path d="M34.9 3.5h8.8c1 0 1.6 1.1 1.1 2l-5.1 9.1c-.5.9-1.5 1.5-2.6 1.5h-5.9l3.7-12.6Z" fill="currentColor"/>
  </svg>;
}

export function BrandLogo({ variant = "header", markOnly = false, className = "" }: { variant?: "header" | "app" | "large"; markOnly?: boolean; className?: string }) {
  const sizes = variant === "large" ? "gap-4 text-[38px]" : variant === "app" ? "gap-2.5 text-[20px]" : "gap-3 text-[24px]";
  const markSize = variant === "large" ? "h-12 w-[58px]" : variant === "app" ? "h-7 w-8" : "h-8 w-10";
  return <span className={`inline-flex items-center text-[#11182b] ${sizes} ${className}`} aria-label={markOnly ? "Within" : undefined}><WithinMark className={markSize}/>{!markOnly && <span className="font-[family-name:var(--font-brand)] font-normal leading-none tracking-[-0.055em]">Within</span>}</span>;
}
