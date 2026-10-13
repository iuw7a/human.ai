"use client";

import Link from "next/link";
import { HumiSettingsForm, type HumiFormValue } from "@/components/humi/HumiSettingsForm";

export function EditHumiClient({
  assistant,
  models,
  memoryCount,
}: {
  assistant: HumiFormValue & { id: string };
  models: { id: string; name: string; description: string }[];
  memoryCount: number;
}) {
  async function onSave(input: HumiFormValue): Promise<boolean> {
    const r = await fetch(`/api/humi-assistants/${assistant.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }).catch(() => null);
    return !!r?.ok;
  }

  async function onDelete(): Promise<boolean> {
    const r = await fetch(`/api/humi-assistants/${assistant.id}`, { method: "DELETE" }).catch(() => null);
    return !!r?.ok;
  }

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-8 pl-14 lg:pl-4">
      <Link href={`/urhumi/${assistant.id}`} className="text-xs text-zinc-400 hover:text-white">
        ← Back to chat
      </Link>
      <h1 className="mt-2 text-xl font-semibold text-white">Customize Humi</h1>
      <p className="mt-1 text-sm text-zinc-500">Only you can see and change these settings.</p>
      <div className="card mt-6 space-y-2 p-6">
        <HumiSettingsForm initial={assistant} models={models} onSave={onSave} onDelete={onDelete} />
      </div>
      <div className="card mt-4 p-5">
        <h2 className="text-sm font-semibold text-white">Memory</h2>
        <p className="mt-1 text-[13px] text-zinc-500">
          {memoryCount} saved {memoryCount === 1 ? "entry" : "entries"}. Humi uses your memories to personalize
          answers — the same memory system as Human AI chats.
        </p>
        <Link href="/memory" className="btn-ghost mt-3 inline-block border border-ink-700 text-[13px]">
          Manage memory
        </Link>
      </div>
    </div>
  );
}
