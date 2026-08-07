"use client";

import { useEffect, useRef } from "react";

export function LandingFlowField() {
  const fieldRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const field = fieldRef.current;
    if (!field) return;

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (reducedMotion.matches) {
      field.style.setProperty("--wind-angle", "0deg");
      field.style.setProperty("--wind-lift", "0px");
      field.style.setProperty("--wind-opacity", ".58");
      return;
    }

    let frame: number | null = null;
    const update = () => {
      frame = null;
      const scrollTop = window.scrollY;
      const viewportHeight = window.innerHeight;
      const maximumScroll = Math.max(document.documentElement.scrollHeight - viewportHeight, 0);
      const progress = maximumScroll > 0 ? Math.min(scrollTop / maximumScroll, 1) : 0;
      const directionalCurve = Math.sin(progress * Math.PI);
      const footerFade = Math.min(Math.max((maximumScroll - scrollTop) / (viewportHeight * 1.35), .12), 1);

      field.style.setProperty("--wind-angle", `${(directionalCurve * 18).toFixed(2)}deg`);
      field.style.setProperty("--wind-lift", `${(directionalCurve * 30).toFixed(2)}px`);
      field.style.setProperty("--wind-opacity", `${(.92 * footerFade).toFixed(3)}`);
    };
    const requestUpdate = () => {
      if (frame === null) frame = window.requestAnimationFrame(update);
    };

    update();
    window.addEventListener("scroll", requestUpdate, { passive: true });
    window.addEventListener("resize", requestUpdate);
    return () => {
      window.removeEventListener("scroll", requestUpdate);
      window.removeEventListener("resize", requestUpdate);
      if (frame !== null) window.cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <div ref={fieldRef} className="landing-flow-field" aria-hidden="true">
      <svg viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice">
        <defs>
          <linearGradient id="within-wind-blue" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#edf3ff" stopOpacity="0" />
            <stop offset=".13" stopColor="#dce8ff" stopOpacity=".68" />
            <stop offset=".48" stopColor="#87a6ef" stopOpacity=".76" />
            <stop offset=".82" stopColor="#d9e6ff" stopOpacity=".46" />
            <stop offset="1" stopColor="#f7f7f4" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="within-wind-white" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#ffffff" stopOpacity="0" />
            <stop offset=".18" stopColor="#f8fbff" stopOpacity=".92" />
            <stop offset=".58" stopColor="#afc3ee" stopOpacity=".76" />
            <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
          </linearGradient>
          <filter id="within-wind-soft" x="-12%" y="-30%" width="124%" height="160%">
            <feGaussianBlur stdDeviation="3.2" />
          </filter>
        </defs>
        <g className="landing-wind-drift">
          <g className="wind-soft-ribbons" filter="url(#within-wind-soft)">
            <path className="wind-ribbon" d="M-280 150 C 90 58 310 218 620 164 S 1130 70 1810 204" />
            <path className="wind-ribbon" d="M-260 312 C 80 232 350 372 670 306 S 1180 220 1800 356" />
            <path className="wind-ribbon" d="M-300 512 C 40 420 338 570 666 508 S 1190 432 1820 598" />
            <path className="wind-ribbon" d="M-250 708 C 90 632 370 754 690 704 S 1210 660 1800 786" />
          </g>
          <g className="wind-streamlines">
            <path className="wind-ribbon" d="M-250 104 C 120 28 350 168 654 112 S 1150 28 1810 162" />
            <path className="wind-ribbon" d="M-290 192 C 44 122 334 258 634 198 S 1122 112 1800 254" />
            <path className="wind-ribbon" d="M-250 274 C 106 198 374 330 690 270 S 1190 184 1810 324" />
            <path className="wind-ribbon" d="M-310 392 C 20 300 330 454 650 390 S 1160 294 1820 462" />
            <path className="wind-ribbon" d="M-270 474 C 70 386 352 532 666 474 S 1180 382 1810 540" />
            <path className="wind-ribbon" d="M-290 590 C 58 508 346 650 670 590 S 1180 510 1820 660" />
            <path className="wind-ribbon" d="M-250 672 C 104 602 388 728 710 674 S 1212 608 1800 742" />
            <path className="wind-ribbon" d="M-300 790 C 30 720 350 836 680 796 S 1190 756 1810 858" />
          </g>
        </g>
      </svg>
    </div>
  );
}
