import type { ReactNode } from "react";

export function SectionTitle({ eyebrow, title, description, action }: { eyebrow?: string; title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="flex items-end justify-between gap-10">
      <div>
        {eyebrow && <p className="mb-4 text-[10px] font-medium uppercase tracking-[0.15em] text-accent">{eyebrow}</p>}
        <h2 className="max-w-3xl text-[38px] font-normal leading-[1.08] tracking-[-0.045em] text-ink">{title}</h2>
        {description && <p className="mt-4 text-sm leading-6 text-muted">{description}</p>}
      </div>
      {action && <div className="pb-1">{action}</div>}
    </div>
  );
}
