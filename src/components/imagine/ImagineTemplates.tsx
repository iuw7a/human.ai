"use client";

import { useState } from "react";
import { Lock } from "lucide-react";
import {
  IMAGINE_EDITING_PENDING,
  IMAGINE_TEMPLATES,
  type ImagineMotif,
} from "@/lib/imagine-templates";

/**
 * Shown in the empty chat when the image model is active: pick a template and
 * its prompt lands in the composer.
 *
 * The card art is pure CSS — a *style preview*, not a generated sample. The
 * editing features from the reference layout that do not exist here are listed
 * separately, greyed out and unclickable.
 */
function Motif({ kind }: { kind: ImagineMotif }) {
  if (kind === "orb") {
    return (
      <span
        className="absolute inset-0 block"
        style={{
          background:
            "radial-gradient(circle at 50% 58%, rgba(255,255,255,0.34), rgba(255,255,255,0.06) 34%, transparent 62%)",
        }}
      />
    );
  }
  if (kind === "band") {
    return (
      <span
        className="absolute inset-0 block"
        style={{
          background:
            "linear-gradient(115deg, transparent 34%, rgba(255,255,255,0.20) 35%, rgba(255,255,255,0.20) 47%, transparent 48%)",
        }}
      />
    );
  }
  if (kind === "dots") {
    return (
      <span
        className="absolute inset-0 block"
        style={{
          background:
            "radial-gradient(rgba(255,255,255,0.30) 1.4px, transparent 1.6px) 0 0 / 13px 13px",
          maskImage: "linear-gradient(180deg, transparent 8%, #000 45%, #000 72%, transparent 100%)",
          WebkitMaskImage:
            "linear-gradient(180deg, transparent 8%, #000 45%, #000 72%, transparent 100%)",
        }}
      />
    );
  }
  if (kind === "arch") {
    return (
      <span
        className="absolute inset-x-0 bottom-0 block h-[62%]"
        style={{
          background:
            "radial-gradient(ellipse 58% 100% at 50% 100%, rgba(255,255,255,0.26), transparent 70%)",
        }}
      />
    );
  }
  return (
    <span className="absolute inset-0 block">
      <span
        className="absolute block rounded-full"
        style={{
          left: "12%",
          top: "18%",
          width: "46%",
          height: "46%",
          background: "radial-gradient(circle, rgba(255,255,255,0.30), transparent 68%)",
        }}
      />
      <span
        className="absolute block rounded-full"
        style={{
          right: "6%",
          bottom: "-8%",
          width: "58%",
          height: "58%",
          background: "radial-gradient(circle, rgba(255,255,255,0.18), transparent 70%)",
        }}
      />
    </span>
  );
}

export function ImagineTemplates({ onPick }: { onPick: (prompt: string) => void }) {
  const [picked, setPicked] = useState<string | null>(null);

  return (
    <section className="mt-8 text-left">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 className="text-[13px] font-semibold text-white">Templates</h2>
        <p className="text-[11.5px] text-zinc-500">
          Tap one — its prompt goes into the box, and you can change anything.
        </p>
      </div>

      <div className="mt-3 columns-2 gap-3 sm:columns-3">
        {IMAGINE_TEMPLATES.map((t, i) => {
          const active = picked === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => {
                setPicked(t.id);
                onPick(t.prompt);
              }}
              aria-label={`Use template: ${t.label}`}
              title={t.prompt}
              style={{
                height: t.height,
                borderColor: active ? "rgba(229,72,77,0.75)" : "rgba(255,255,255,0.08)",
                animationDelay: `${i * 35}ms`,
              }}
              className="group relative mb-3 block w-full break-inside-avoid overflow-hidden rounded-2xl border text-left opacity-0 animate-[fadeSlideUp_0.5s_ease-out_both] transition-transform duration-200 hover:-translate-y-0.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
            >
              <span
                aria-hidden
                className="absolute inset-0 block"
                style={{ background: `linear-gradient(150deg, ${t.from}, ${t.to})` }}
              />
              <span aria-hidden className="absolute inset-0 block opacity-80">
                <Motif kind={t.motif} />
              </span>
              <span
                aria-hidden
                className="absolute inset-x-0 bottom-0 block h-[70%]"
                style={{
                  background:
                    "linear-gradient(180deg, transparent, rgba(0,0,0,0.55) 42%, rgba(0,0,0,0.88))",
                }}
              />
              <span className="absolute inset-x-0 bottom-0 block p-3">
                <span className="block text-[13px] font-semibold text-white">{t.label}</span>
                <span className="mt-0.5 block text-[11px] text-zinc-400">{t.hint}</span>
              </span>
              {active && (
                <span className="absolute right-2.5 top-2.5 rounded-full bg-accent px-2 py-0.5 text-[10px] font-medium text-white">
                  in the box
                </span>
              )}
            </button>
          );
        })}
      </div>

      <p className="mt-1 text-[11px] leading-5 text-zinc-600">
        The previews are drawn with gradients — they are not generated images. What comes out
        depends on your prompt.
      </p>

      <div className="mt-7">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h2 className="text-[13px] font-semibold text-white">Editing</h2>
          <span className="rounded-full border border-ink-700 px-2 py-0.5 text-[10px] uppercase tracking-wider text-zinc-500">
            coming soon
          </span>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {IMAGINE_EDITING_PENDING.map((e) => (
            <div
              key={e.id}
              title="Not available yet"
              className="flex items-center gap-2 rounded-xl border border-ink-800 bg-ink-900/60 px-3 py-2.5 opacity-60"
            >
              <Lock size={12} className="shrink-0 text-zinc-500" />
              <span className="truncate text-[12px] text-zinc-400">{e.label}</span>
            </div>
          ))}
        </div>
        <p className="mt-2 text-[11px] leading-5 text-zinc-600">
          humi.1 images creates new images from text only. Editing a picture you upload is not
          available yet.
        </p>
      </div>
    </section>
  );
}
