/**
 * User-facing model display: clean family names + family badges.
 * Strips gateway suffixes like " (CodeCraft)" and prettifies slugs
 * ("claude-opus-4-6" -> "Claude Opus 4.6"). Admin keeps raw names.
 */

export function prettyModelName(raw: string): string {
  const base = raw.replace(/\s*\(.*?\)\s*$/, "").trim();
  if (!base) return raw;
  // Qwen style: qwen3-8-27b -> Qwen3.8 27B
  const qwen = base.match(/^qwen(\d)-(\d)-(\d+b)$/i);
  if (qwen) return `Qwen${qwen[1]}.${qwen[2]} ${qwen[3].toUpperCase()}`;
  const parts = base.split(/[-_/:\s.]+/);
  const out: string[] = [];
  let nums: string[] = [];
  const cap = (w: string) => w.charAt(0).toUpperCase() + w.slice(1);
  const flush = () => {
    if (nums.length) {
      out.push(nums.join("."));
      nums = [];
    }
  };
  for (const p of parts) {
    if (!p) continue;
    if (/^\d+$/.test(p)) {
      nums.push(p);
      continue;
    }
    flush();
    // "humi1.1" -> "Humi" + "1.1" (alpha prefix longer than 1 char)
    const mixed = p.match(/^([A-Za-z]{2,})(\d.*)$/);
    if (mixed) {
      out.push(cap(mixed[1]));
      if (/^\d+$/.test(mixed[2])) nums.push(mixed[2]);
      else out.push(mixed[2]);
      continue;
    }
    out.push(cap(p));
  }
  flush();
  let s = out.join(" ");
  s = s.replace(/^Gpt\b/, "GPT").replace(/\bOss\b/g, "OSS").replace(/\bVl\b/g, "VL").replace(/\bAi\b/g, "AI").replace(/\bXs\b/g, "XS").replace(/\bIt\b/g, "IT");
  // trailing single-digit version glue: "Kimi K2 6" -> "Kimi K2.6"
  s = s.replace(/([A-Za-z]+\d(?:\.\d+)?) (\d)(?![\d.])/g, "$1.$2");
  // unit: "27b" -> "27B", "120b" -> "120B"
  s = s.replace(/\b(\d+)b\b/gi, "$1B");
  return s;
}

export interface ModelFamily {
  letter: string;
  label: string;
  classes: string;
}

const FAMILIES: { test: RegExp; letter: string; label: string; classes: string }[] = [
  { test: /claude/i, letter: "C", label: "Claude", classes: "bg-[#D97757]/15 text-[#E89B85] ring-[#D97757]/40" },
  { test: /gemini|gemma|banana|google/i, letter: "G", label: "Google", classes: "bg-[#4285F4]/15 text-[#8AB4F8] ring-[#4285F4]/40" },
  { test: /gpt|openai|oss/i, letter: "O", label: "OpenAI", classes: "bg-emerald-500/15 text-emerald-300 ring-emerald-500/40" },
  { test: /grok|x-ai/i, letter: "X", label: "xAI", classes: "bg-zinc-400/15 text-zinc-200 ring-zinc-400/40" },
  { test: /deepseek/i, letter: "D", label: "DeepSeek", classes: "bg-sky-500/15 text-sky-300 ring-sky-500/40" },
  { test: /qwen|alibaba/i, letter: "Q", label: "Qwen", classes: "bg-violet-500/15 text-violet-300 ring-violet-500/40" },
  { test: /kimi|moonshot/i, letter: "K", label: "Kimi", classes: "bg-blue-600/15 text-blue-300 ring-blue-500/40" },
  { test: /mistral|codestral|ministral|devstral|mixtral/i, letter: "M", label: "Mistral", classes: "bg-orange-500/15 text-orange-300 ring-orange-500/40" },
  { test: /glm|z-?ai|zhipu/i, letter: "Z", label: "Zhipu", classes: "bg-indigo-500/15 text-indigo-300 ring-indigo-500/40" },
  { test: /minimax/i, letter: "M", label: "MiniMax", classes: "bg-slate-400/15 text-slate-200 ring-slate-400/40" },
  { test: /seed|byteplus|doubao/i, letter: "S", label: "Seed", classes: "bg-teal-500/15 text-teal-300 ring-teal-500/40" },
  { test: /muse/i, letter: "S", label: "Muse", classes: "bg-amber-500/15 text-amber-300 ring-amber-500/40" },
  { test: /nemotron|nvidia/i, letter: "N", label: "NVIDIA", classes: "bg-green-500/15 text-green-300 ring-green-500/40" },
  { test: /cohere|command|aya|north/i, letter: "C", label: "Cohere", classes: "bg-cyan-500/15 text-cyan-300 ring-cyan-500/40" },
  { test: /laguna|poolside/i, letter: "L", label: "Laguna", classes: "bg-fuchsia-500/15 text-fuchsia-300 ring-fuchsia-500/40" },
  { test: /mimo|xiaomi/i, letter: "M", label: "MiMo", classes: "bg-rose-500/15 text-rose-300 ring-rose-500/40" },
  { test: /hy\d|tencent|hunyuan/i, letter: "H", label: "Tencent", classes: "bg-blue-400/15 text-blue-200 ring-blue-400/40" },
  { test: /longcat|meituan/i, letter: "L", label: "LongCat", classes: "bg-yellow-500/15 text-yellow-300 ring-yellow-500/40" },
  { test: /mercury|inception/i, letter: "M", label: "Mercury", classes: "bg-purple-500/15 text-purple-300 ring-purple-500/40" },
  { test: /human|humi/i, letter: "H", label: "Human AI", classes: "bg-accent/15 text-white ring-accent/40" },
];

export function familyOf(id: string, name?: string): ModelFamily {
  const s = `${id} ${name ?? ""}`;
  for (const f of FAMILIES) {
    if (f.test.test(s)) return { letter: f.letter, label: f.label, classes: f.classes };
  }
  return { letter: (id.trim()[0] ?? "?").toUpperCase(), label: "", classes: "bg-zinc-500/15 text-zinc-400 ring-zinc-500/30" };
}
