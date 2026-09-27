import { AppShell } from "@/components/AppShell";

export default function AboutPage() {
  return (
    <AppShell>
      <div className="mx-auto w-full max-w-2xl px-4 py-10 pl-14 lg:pl-4">
        <p className="text-xs font-medium uppercase tracking-widest text-accent">
          About
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-white">
          About Human AI
        </h1>
        <div className="prose-humanai mt-4">
          <p>
            Human AI is an independent AI chat platform built around a simple
            idea: talking to AI should feel immediate, calm, and private. No
            cluttered dashboards, no maze of menus — just a fast input box and
            answers you can read and trust.
          </p>
          <p>
            The platform currently offers conversational answers with text and
            image understanding, streaming responses, saved chat history, and a
            personal memory store. Accounts, chats, and memories are strictly
            isolated per user.
          </p>
          <h3>How it works</h3>
          <p>
            Messages are processed server-side through the configured model
            provider. API keys never reach the browser. The model layer is
            deliberately separated from the interface, so additional models and
            capabilities can be added over time without rebuilding the product.
          </p>
          <h3>What Human AI is not</h3>
          <p>
            Human AI does not claim to be infallible. AI responses can contain
            mistakes, so important information should always be verified. The
            platform makes no promises about specific performance benchmarks —
            it aims to be genuinely useful, day to day.
          </p>
        </div>
      </div>
    </AppShell>
  );
}
