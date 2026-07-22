"use client";

import { useEffect, useRef } from "react";

export const WITHIN_ENTRY_SOURCE_KEY = "within-entry-source";
export const WITHIN_APP_INTRO_SEEN_KEY = "within-app-intro-seen";
export const APP_ENTRY_FULL_MS = 1280;
export const APP_ENTRY_DIRECT_MS = 400;

export function AppEntryReveal({ mode, onComplete }: { mode: "full" | "direct"; onComplete: () => void }) {
  const completeRef = useRef(onComplete);
  useEffect(() => { completeRef.current = onComplete; }, [onComplete]);
  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const timer = window.setTimeout(() => completeRef.current(), reduced ? 200 : mode === "full" ? APP_ENTRY_FULL_MS : APP_ENTRY_DIRECT_MS);
    return () => window.clearTimeout(timer);
  }, [mode]);
  return <div className={`app-entry-mask app-entry-mask-${mode}`} aria-hidden="true"><span/></div>;
}
