import type { ButtonHTMLAttributes, ReactNode } from "react";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "quiet" | "icon";
  children: ReactNode;
};

const styles = {
  primary: "border-accent bg-accent text-white hover:bg-accent-hover",
  secondary: "border-border-strong bg-white text-ink hover:border-[#c9cac5] hover:bg-[#fdfdfb]",
  quiet: "border-transparent bg-transparent text-muted hover:bg-white hover:text-ink",
  icon: "size-9 border-border bg-white text-muted hover:text-ink",
};

export function Button({ variant = "secondary", className = "", children, type = "button", ...props }: ButtonProps) {
  return (
    <button
      type={type}
      className={`inline-flex h-9 items-center justify-center gap-2 rounded-lg border px-3.5 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:pointer-events-none disabled:opacity-50 ${styles[variant]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
