const fs = require("fs");
function loadEnv() {
  const env = {};
  for (const line of fs.readFileSync(".env.local", "utf8").split("\n")) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
  }
  return env;
}
async function ttft(apiKey, model, messages, label) {
  const t0 = Date.now();
  const res = await fetch("https://integrate.api.nvidia.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: "Bearer " + apiKey, "Content-Type": "application/json", Accept: "text/event-stream" },
    body: JSON.stringify({ model, messages, temperature: 0.6, top_p: 0.9, max_tokens: 256, stream: true }),
  });
  if (!res.ok) {
    console.log(label + ": HTTP " + res.status);
    return;
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  let first = -1, tokens = 0;
  const tEnd = Date.now() + 25000;
  for (;;) {
    if (Date.now() > tEnd) break;
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split("\n");
    buf = lines.pop();
    for (const line of lines) {
      const t = line.trim();
      if (!t.startsWith("data:")) continue;
      const d = t.slice(5).trim();
      if (d === "[DONE]") continue;
      try {
        const tok = JSON.parse(d).choices?.[0]?.delta?.content ?? "";
        if (tok) {
          if (first < 0) first = Date.now() - t0;
          tokens++;
          if (tokens >= 20) { reader.cancel(); break; }
        }
      } catch {}
    }
    if (tokens >= 20) break;
  }
  try { reader.cancel(); } catch {}
  const total = Date.now() - t0;
  console.log(label + ": ttft=" + first + "ms, 20tok=" + total + "ms (" + Math.round(20000 / Math.max(1, total - first)) + " tok/s)");
}
(async () => {
  const env = loadEnv();
  const key = env.NVIDIA_API_KEY;
  const model = env.NVIDIA_MODEL_ID || "moonshotai/kimi-k3";
  console.log("model=" + model);
  const sys = { role: "system", content: "You are Jawad, a personal AI companion inside Human AI. " + "Extra context. ".repeat(200) };
  const short = [sys, { role: "user", content: "yo" }];
  const long = [sys];
  for (let i = 0; i < 10; i++) {
    long.push({ role: "user", content: "Question " + i + "? " + "Some detailed message text here. ".repeat(20) });
    long.push({ role: "assistant", content: "Answer " + i + ". " + "Some detailed reply text here. ".repeat(20) });
  }
  long.push({ role: "user", content: "yo" });
  await ttft(key, model, short, "short-ctx");
  await ttft(key, model, long, "long-ctx ");
})();
