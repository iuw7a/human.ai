import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { getAdmin } from "@/lib/admin";

export const dynamic = "force-dynamic";

export default async function McpComingSoonPage() {
  const admin = await getAdmin();

  return (
    <AppShell>
      <div className="mx-auto w-full max-w-2xl px-4 py-16 pl-14 text-center lg:pl-4">
        <p className="text-xs font-medium uppercase tracking-widest text-accent">
          MCP Marketplace
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-white">
          Coming soon
        </h1>
        <p className="mx-auto mt-2 max-w-xl text-[15px] leading-7 text-zinc-400">
          The MCP Marketplace is in private beta — access stays with the Human
          AI team for now.
        </p>
        {admin ? (
          <Link
            href="/mcp"
            className="btn-primary mt-6 inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold"
          >
            Open MCP Marketplace
          </Link>
        ) : (
          <Link
            href="/chat"
            className="mt-6 inline-flex items-center gap-2 rounded-xl border border-white/10 px-5 py-2.5 text-sm text-zinc-300 transition-colors hover:text-white"
          >
            Back to chat
          </Link>
        )}
      </div>
    </AppShell>
  );
}
