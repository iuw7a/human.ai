import Link from "next/link";
import { AppShell } from "@/components/AppShell";

export const dynamic = "force-dynamic";

function H({ children }: { children: React.ReactNode }) {
  return <h2 className="mb-2 mt-8 text-lg font-bold tracking-tight text-white">{children}</h2>;
}

function P({ children }: { children: React.ReactNode }) {
  return <p className="mb-3 text-[15px] leading-7 text-zinc-400">{children}</p>;
}

function Code({ children, label }: { children: string; label: string }) {
  return (
    <div className="mb-4">
      <p className="mb-1.5 font-mono text-xs text-zinc-500">{label}</p>
      <pre className="overflow-x-auto rounded-2xl bg-black/60 p-4 font-mono text-xs leading-5 text-zinc-300">{children}</pre>
    </div>
  );
}

/** /platform/api/docs — public API reference for the Human AI API. */
export default async function ApiDocsPage() {
  return (
    <AppShell>
      <div className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6">
        <p className="text-xs font-medium uppercase tracking-widest text-accent">Developers</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-white">API Documentation</h1>
        <p className="mb-2 mt-2 text-[15px] text-zinc-400">
          Call Human AI from your own apps and scripts. Get a key on the{" "}
          <Link href="/platform/api" className="text-white underline underline-offset-4 hover:no-underline">
            API Keys page
          </Link>
          .
        </p>

        <H>Authentication</H>
        <P>
          Send your key on every request as the <code className="font-mono text-zinc-200">x-api-key</code> header.
          Keys act as you and follow your plan limits. Never put a key in client-side code or a public repo.
        </P>

        <H>Base URL</H>
        <Code label="production">{`https://usehuman.de`}</Code>

        <H>List models</H>
        <Code label="GET /api/models">{`curl https://usehuman.de/api/models`}</Code>
        <P>Returns enabled models: id, display name, vision support and minimum plan. No auth required.</P>

        <H>Chat completions (streaming)</H>
        <Code label="POST /api/chat">{`curl https://usehuman.de/api/chat \\
  -H "x-api-key: YOUR_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "modelId": "humi1.1-speed",
    "messages": [
      { "role": "user", "content": "Hello" }
    ]
  }'`}</Code>
        <P>
          The response is a Server-Sent Events stream. Each event is <code className="font-mono text-zinc-200">data: {"{token}"}</code>;
          the stream ends with <code className="font-mono text-zinc-200">data: [DONE]</code>. Errors arrive as{" "}
          <code className="font-mono text-zinc-200">data: {"{error}"}</code> or a JSON body with an <code className="font-mono text-zinc-200">error</code> field.
        </P>

        <H>JavaScript (fetch)</H>
        <Code label="stream tokens in the browser (key must stay server-side!)">{`const res = await fetch("https://usehuman.de/api/chat", {
  method: "POST",
  headers: { "x-api-key": process.env.HUMANAI_KEY, "Content-Type": "application/json" },
  body: JSON.stringify({ modelId: "humi1.1-speed", messages: [{ role: "user", content: "Hello" }] }),
});
const reader = res.body.getReader();
const decoder = new TextDecoder();
let buffer = "", full = "";
for (;;) {
  const { done, value } = await reader.read();
  if (done) break;
  buffer += decoder.decode(value, { stream: true });
  const lines = buffer.split("\\n");
  buffer = lines.pop();
  for (const line of lines) {
    const t = line.trim();
    if (!t.startsWith("data:")) continue;
    const data = t.slice(5).trim();
    if (data === "[DONE]") continue;
    const json = JSON.parse(data);
    if (json.error) throw new Error(json.error);
    if (json.token) full += json.token;
  }
}`}</Code>

        <H>Python (requests)</H>
        <Code label="stream tokens with requests">{`import json, requests

resp = requests.post(
    "https://usehuman.de/api/chat",
    headers={"x-api-key": "YOUR_KEY", "Content-Type": "application/json"},
    json={"modelId": "humi1.1-speed", "messages": [{"role": "user", "content": "Hello"}]},
    stream=True,
)
full = ""
for line in resp.iter_lines():
    line = line.decode().strip()
    if not line.startswith("data:"):
        continue
    data = line[5:].strip()
    if data == "[DONE]":
        continue
    chunk = json.loads(data)
    if chunk.get("error"):
        raise RuntimeError(chunk["error"])
    full += chunk.get("token", "")
print(full)`}</Code>

        <H>Images</H>
        <P>
          Attach images by adding an <code className="font-mono text-zinc-200">images</code> array with{" "}
          <code className="font-mono text-zinc-200">{"{url}"}</code> entries (data-URI or https) to a message.
          Only vision-capable models accept them — check the model list first.
        </P>
        <Code label="message with image">{`{ "role": "user", "content": "What is this?", "images": [{ "url": "https://…" }] }`}</Code>

        <H>Errors</H>
        <P>
          <code className="font-mono text-zinc-200">401</code> invalid key ·{" "}
          <code className="font-mono text-zinc-200">403</code> model needs a higher plan ·{" "}
          <code className="font-mono text-zinc-200">400</code> bad request ·{" "}
          <code className="font-mono text-zinc-200">429</code> rate-limited, retry with backoff ·{" "}
          <code className="font-mono text-zinc-200">5xx</code> provider issue, retry shortly.
        </P>

        <H>Rate limits & plans</H>
        <P>
          Usage counts against your account. Model availability follows your subscription — the{" "}
          <code className="font-mono text-zinc-200">allowed</code> flag on <code className="font-mono text-zinc-200">GET /api/models</code>{" "}
          (when logged in) tells you what you may use. Revoke a key any time on the API Keys page; apps using it stop immediately.
        </P>

        <div className="mt-8">
          <Link
            href="/platform/api"
            className="inline-flex items-center gap-1.5 rounded-2xl bg-white px-6 py-3 text-[15px] font-semibold text-zinc-900 transition-colors hover:bg-zinc-200"
          >
            Get an API key
          </Link>
        </div>
      </div>
    </AppShell>
  );
}
