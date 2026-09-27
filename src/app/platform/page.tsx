import Link from "next/link";
import { MessageSquarePlus, Image, History, Brain, ShieldCheck, Zap } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { listModels } from "@/lib/models";

const FEATURES = [
  {
    icon: Zap,
    title: "Streaming answers",
    text: "Responses appear token by token, with Markdown and clean code rendering.",
  },
  {
    icon: Image,
    title: "Image understanding",
    text: "Attach screenshots or photos and ask questions about them.",
  },
  {
    icon: History,
    title: "Saved history",
    text: "Chats persist per account and stay private to you.",
  },
  {
    icon: Brain,
    title: "Memory",
    text: "Store preferences Human AI can use to personalize answers later.",
  },
  {
    icon: ShieldCheck,
    title: "Private by design",
    text: "Row-level security isolates every user's data. Keys stay server-side.",
  },
  {
    icon: MessageSquarePlus,
    title: "Extensible models",
    text: "One model registry — new providers plug in without rewiring the app.",
  },
];

export default function PlatformPage() {
  // Dedupe by backend model — UI stays white-label, no slugs or providers shown.
  const models = listModels().filter(
    (m, i, all) =>
      all.findIndex((x) => x.providerModelId === m.providerModelId) === i
  );
  return (
    <AppShell>
      <div className="mx-auto w-full max-w-3xl px-4 py-10 pl-14 lg:pl-4">
        <p className="text-xs font-medium uppercase tracking-widest text-accent">
          Platform
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-white">
          The Human AI platform
        </h1>
        <p className="mt-2 max-w-xl text-[15px] leading-7 text-zinc-400">
          Human AI is a minimal, fast AI chat platform: one input, streaming
          answers, image analysis, and your history — without clutter.
        </p>

        <div className="mt-8 grid gap-3 sm:grid-cols-2">
          {FEATURES.map((f) => (
            <div key={f.title} className="card p-5">
              <f.icon size={18} className="text-accent" />
              <h2 className="mt-3 text-[15px] font-semibold text-white">{f.title}</h2>
              <p className="mt-1 text-sm leading-6 text-zinc-400">{f.text}</p>
            </div>
          ))}
        </div>

        <h2 className="mt-10 text-lg font-semibold text-white">Models</h2>
        <div className="mt-3 space-y-2">
          {models.map((m) => (
            <div key={m.providerModelId} className="card flex items-center justify-between px-4 py-3">
              <div>
                <p className="text-[15px] font-medium text-white">{m.name}</p>
                <p className="text-[13px] text-zinc-500">{m.description}</p>
              </div>
              {m.vision && (
                <span className="rounded-full border border-ink-700 px-2.5 py-1 text-xs text-zinc-400">
                  Vision
                </span>
              )}
            </div>
          ))}
        </div>

        <div className="mt-10 flex flex-wrap gap-3">
          <Link href="/" className="btn-primary">
            Start chatting
          </Link>
          <Link href="/platform/about" className="btn-ghost border border-ink-700">
            About Human AI
          </Link>
        </div>
      </div>
    </AppShell>
  );
}
