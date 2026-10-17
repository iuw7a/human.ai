import Link from "next/link";
import {
  AudioLines,
  Bot,
  Brain,
  Crown,
  Gamepad2,
  Hammer,
  Heart,
  History,
  Image as ImageIcon,
  LibraryBig,
  MessageSquarePlus,
  MonitorSmartphone,
  Plug,
  Puzzle,
  ShieldCheck,
  Sparkles,
  Zap,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { PlatformShell } from "@/components/platform/PlatformShell";
import { WordmarkFooter } from "@/components/site/WordmarkFooter";
import { listModels } from "@/lib/models";

export const metadata = {
  title: "Platform — Human AI",
  description:
    "What the Human AI platform is and what it can do. Information only — everything you operate lives in the dashboard.",
};

const CAPABILITIES: { icon: LucideIcon; title: string; text: string }[] = [
  {
    icon: Zap,
    title: "Streaming answers",
    text: "Responses appear token by token, with Markdown and clean code rendering.",
  },
  {
    icon: ImageIcon,
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
    text: "Store preferences Human AI can use to personalize later answers.",
  },
  {
    icon: ShieldCheck,
    title: "Private by design",
    text: "Row-level security isolates every account. Keys stay server-side.",
  },
  {
    icon: Sparkles,
    title: "Extensible models",
    text: "One model registry — new models plug in without changing your workflow.",
  },
];

const STEPS: { n: string; title: string; text: string }[] = [
  {
    n: "1",
    title: "Ask in plain language",
    text: "Type, paste or attach an image. There is no prompt syntax to learn.",
  },
  {
    n: "2",
    title: "Watch the answer arrive",
    text: "Text streams in as it is written, code comes in ready-to-copy blocks.",
  },
  {
    n: "3",
    title: "Keep what matters",
    text: "History, memory and files belong to your account — and to nobody else.",
  },
];

type Area = {
  icon: LucideIcon;
  title: string;
  text: string;
  href: string;
  badge?: "Sign in" | "Coming soon";
};

const AREAS: Area[] = [
  {
    icon: MessageSquarePlus,
    title: "Chat",
    text: "Ask anything, attach images, keep the thread.",
    href: "/",
  },
  {
    icon: Bot,
    title: "Agent",
    text: "Let the browser agent research and run tasks.",
    href: "/agent",
    badge: "Sign in",
  },
  {
    icon: MonitorSmartphone,
    title: "Computer use",
    text: "Hand longer screen workflows to the agent.",
    href: "/computer-use",
    badge: "Sign in",
  },
  {
    icon: Hammer,
    title: "Build",
    text: "Describe an app — it gets built and deployed.",
    href: "/build",
    badge: "Sign in",
  },
  {
    icon: AudioLines,
    title: "Text to Voice",
    text: "Turn written text into speech.",
    href: "/text2voice",
  },
  {
    icon: Plug,
    title: "MCP servers",
    text: "Connect external tools, docs and services.",
    href: "/mcp",
    badge: "Coming soon",
  },
  {
    icon: LibraryBig,
    title: "Library",
    text: "Saved items and collections.",
    href: "/library",
    badge: "Sign in",
  },
  {
    icon: Puzzle,
    title: "Plugins",
    text: "Extra capabilities on top of the core.",
    href: "/plugins",
    badge: "Sign in",
  },
  {
    icon: Brain,
    title: "Memory",
    text: "Decide what Human AI may remember about you.",
    href: "/memory",
    badge: "Sign in",
  },
  {
    icon: Gamepad2,
    title: "Chess",
    text: "Play a game against Human AI.",
    href: "/chess",
  },
  {
    icon: Heart,
    title: "Humi",
    text: "Your personal companion bot.",
    href: "/humi",
  },
  {
    icon: Crown,
    title: "Rema",
    text: "The second companion bot.",
    href: "/rema",
  },
];

const OPERATIONS: { title: string; text: string; href: string }[] = [
  { title: "Dashboard", text: "Overview of your account.", href: "/platform/dash" },
  { title: "API keys", text: "Create, scope and revoke keys.", href: "/platform/dash/apikey" },
  { title: "Usage & limits", text: "Requests, tokens, plan access.", href: "/platform/dash/usage" },
  { title: "Models", text: "What is available to you.", href: "/platform/dash/models" },
  { title: "Playground", text: "Try a request in the browser.", href: "/platform/dash/playground" },
  { title: "Plans", text: "Compare the Humi tiers.", href: "/pricing" },
];

function SectionHeading({ eyebrow, title, sub }: { eyebrow: string; title: string; sub?: string }) {
  return (
    <div className="mb-5">
      <p className="text-[11px] font-medium uppercase tracking-widest text-accent">{eyebrow}</p>
      <h2 className="mt-1.5 text-xl font-semibold tracking-tight text-white sm:text-2xl">{title}</h2>
      {sub && <p className="mt-2 max-w-2xl text-[14px] leading-6 text-zinc-400">{sub}</p>}
    </div>
  );
}

export default function PlatformPage() {
  // Dedupe by backend model and by display name — several legacy slugs map to
  // the same model, and the UI must stay white-label (no slugs, no providers).
  const models = listModels()
    .filter((m, i, all) => all.findIndex((x) => x.providerModelId === m.providerModelId) === i)
    .filter((m, i, all) => all.findIndex((x) => x.name === m.name) === i);

  return (
    <PlatformShell>
      <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6">
        {/* Hero */}
        <header className="relative overflow-hidden rounded-3xl border border-ink-800 bg-ink-900/50 px-6 py-10 sm:px-10 sm:py-12">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 -top-40 h-80"
            style={{
              background:
                "radial-gradient(ellipse 60% 70% at 50% 0%, rgba(229,72,77,0.20), transparent 70%)",
            }}
          />
          <div className="relative">
            <p className="inline-flex items-center gap-2 rounded-full border border-accent/30 bg-accent/10 px-3 py-1 text-[11px] font-medium uppercase tracking-widest text-accent">
              <Sparkles className="h-3 w-3" />
              Platform
            </p>
            <h1 className="mt-4 text-3xl font-semibold tracking-tight text-white sm:text-4xl">
              The Human AI platform
            </h1>
            <p className="mt-3 max-w-2xl text-[15px] leading-7 text-zinc-400">
              One account for chatting, research, building and your own API. This page explains what
              exists and how the parts fit together — everything you actually operate lives in the
              dashboard.
            </p>
            <div className="mt-6 flex flex-wrap gap-2">
              <Link href="/platform/dash" className="btn-primary">
                Open dashboard
              </Link>
              <Link href="/" className="btn-ghost border border-ink-700">
                Start chatting
              </Link>
              <Link href="/docs" className="btn-ghost border border-ink-700">
                Documentation
              </Link>
            </div>
          </div>
        </header>

        {/* Capabilities */}
        <section className="mt-12">
          <SectionHeading
            eyebrow="Capabilities"
            title="What you get"
            sub="The core of the platform — the same in every plan, with model access that grows."
          />
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {CAPABILITIES.map((f) => (
              <div key={f.title} className="card p-5">
                <f.icon size={18} className="text-accent" />
                <h3 className="mt-3 text-[15px] font-semibold text-white">{f.title}</h3>
                <p className="mt-1 text-[13px] leading-6 text-zinc-400">{f.text}</p>
              </div>
            ))}
          </div>
        </section>

        {/* How it works */}
        <section className="mt-12">
          <SectionHeading eyebrow="How it works" title="Three steps, every time" />
          <div className="grid gap-3 sm:grid-cols-3">
            {STEPS.map((s) => (
              <div key={s.n} className="card p-5">
                <span className="grid h-7 w-7 place-items-center rounded-full bg-accent/15 text-[12.5px] font-semibold text-accent">
                  {s.n}
                </span>
                <h3 className="mt-3 text-[15px] font-semibold text-white">{s.title}</h3>
                <p className="mt-1 text-[13px] leading-6 text-zinc-400">{s.text}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Areas */}
        <section className="mt-12">
          <SectionHeading
            eyebrow="Inside the platform"
            title="Every area, one line each"
            sub="Some areas work without an account, some need one, and one is still being built. The badge tells you which."
          />
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {AREAS.map((a) => (
              <Link
                key={a.href}
                href={a.href}
                className="card group flex flex-col p-5 transition-colors hover:border-ink-600"
              >
                <div className="flex items-center gap-2">
                  <a.icon size={18} className="text-accent" />
                  <h3 className="text-[15px] font-semibold text-white">{a.title}</h3>
                  {a.badge && (
                    <span className="ml-auto shrink-0 rounded-full border border-ink-700 px-2 py-0.5 text-[10px] uppercase tracking-wider text-zinc-500">
                      {a.badge}
                    </span>
                  )}
                </div>
                <p className="mt-2 text-[13px] leading-6 text-zinc-400">{a.text}</p>
              </Link>
            ))}
          </div>
        </section>

        {/* Models */}
        <section className="mt-12">
          <SectionHeading
            eyebrow="Models"
            title="What answers your questions"
            sub="Availability follows your plan. The dashboard shows exactly which models your account may use."
          />
          <div className="overflow-hidden rounded-xl border border-ink-800">
            {models.map((m, i) => (
              <div
                key={m.name}
                className={`flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 ${
                  i > 0 ? "border-t border-ink-800" : ""
                }`}
              >
                <p className="w-40 shrink-0 font-mono text-[12.5px] text-white">{m.name}</p>
                <p className="min-w-0 flex-1 text-[13px] text-zinc-400">{m.description}</p>
                <span className="flex shrink-0 gap-1.5">
                  {m.vision && (
                    <span className="rounded-full border border-ink-700 px-2 py-0.5 text-[10px] uppercase tracking-wider text-zinc-400">
                      Images
                    </span>
                  )}
                  {m.streaming && (
                    <span className="rounded-full border border-ink-700 px-2 py-0.5 text-[10px] uppercase tracking-wider text-zinc-400">
                      Streaming
                    </span>
                  )}
                </span>
              </div>
            ))}
          </div>
        </section>

        {/* Operations */}
        <section className="mt-12">
          <div className="relative overflow-hidden rounded-3xl border border-ink-800 bg-ink-900/50 p-6 sm:p-8">
            <div
              aria-hidden
              className="pointer-events-none absolute -right-20 -top-24 h-64 w-64"
              style={{
                background:
                  "radial-gradient(circle at 50% 50%, rgba(229,72,77,0.16), transparent 70%)",
              }}
            />
            <div className="relative">
              <h2 className="text-xl font-semibold tracking-tight text-white">
                This page is information only
              </h2>
              <p className="mt-2 max-w-2xl text-[14px] leading-6 text-zinc-400">
                Nothing here does anything — no buttons that change your account. Everything you
                operate sits in one place, so there is only ever one version of the truth: your keys,
                usage, limits, models and billing.
              </p>
              <div className="mt-6 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {OPERATIONS.map((o) => (
                  <Link
                    key={o.href}
                    href={o.href}
                    className="flex items-baseline gap-2 rounded-xl border border-ink-800 bg-black/30 px-3.5 py-2.5 transition-colors hover:border-ink-600"
                  >
                    <span className="text-[13px] font-medium text-zinc-200">{o.title}</span>
                    <span className="ml-auto text-right text-[11.5px] text-zinc-500">{o.text}</span>
                  </Link>
                ))}
              </div>
              <div className="mt-6 flex flex-wrap gap-2">
                <Link href="/platform/dash" className="btn-primary">
                  Open dashboard
                </Link>
                <Link href="/platform/api/docs" className="btn-ghost border border-ink-700">
                  API reference
                </Link>
                <Link href="/platform/about" className="btn-ghost border border-ink-700">
                  About Human AI
                </Link>
              </div>
            </div>
          </div>
        </section>
      </div>
      <WordmarkFooter />
    </PlatformShell>
  );
}
