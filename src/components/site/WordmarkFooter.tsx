"use client";

import { useRef, useState } from "react";

/**
 * Full-bleed footer with the brand wordmark as an outline — x.com style:
 * it stays a thin contour until the pointer touches it, then a gradient
 * fill opens up around the cursor and follows it.
 *
 * Three text layers sit exactly on top of each other (see globals.css → "Wortmarke"):
 * outline, cursor-revealed gradient fill, and a slow idle sheen. The fill is
 * masked by a radial gradient whose centre comes from --mx/--my, which we write
 * straight onto the element — no re-render per mouse move.
 *
 * Use it on full-height content pages (docs, pricing, platform, dashboard),
 * never inside the chat layout. The wordmark scales to its container, so it
 * also fits next to the dashboard sidebar.
 */
export function WordmarkFooter({ showBorder = true }: { showBorder?: boolean } = {}) {
  const box = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState(false);

  function track(e: React.PointerEvent<HTMLDivElement>) {
    const el = box.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) return;
    el.style.setProperty("--mx", `${((e.clientX - r.left) / r.width) * 100}%`);
    el.style.setProperty("--my", `${((e.clientY - r.top) / r.height) * 100}%`);
    el.style.setProperty("--r", `${Math.max(r.width * 0.3, 140)}px`);
  }

  return (
    <section className={`mt-16 overflow-hidden ${showBorder ? "border-t border-ink-800" : ""}`}>
      <div
        className="wm-frame px-2 pb-4 pt-6 sm:px-4"
        onPointerMove={track}
        onPointerEnter={() => setHover(true)}
        onPointerLeave={() => setHover(false)}
        onPointerDown={(e) => {
          setHover(true);
          track(e);
        }}
        onPointerUp={() => setHover(false)}
      >
        <div
          ref={box}
          role="img"
          aria-label="usehuman.de"
          className={`wm-wrap relative w-full ${hover ? "wm-hover" : ""}`}
        >
          <span className="wm-text wm-base">usehuman.de</span>
          <span aria-hidden className="wm-text wm-layer wm-fill">
            usehuman.de
          </span>
          <span aria-hidden className="wm-text wm-layer wm-sheen">
            usehuman.de
          </span>
        </div>
      </div>
    </section>
  );
}
