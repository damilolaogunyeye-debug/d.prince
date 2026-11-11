import "server-only";
import { sql } from "drizzle-orm";
import { localDb } from "@/db";

/**
 * AI provider for the CBT question tools. Configured by environment variables
 * (OPENAI_API_KEY / GEMINI_API_KEY / ANTHROPIC_API_KEY) or by the key the Super Admin
 * saves on the AI Assistant page (kept in the server-side settings, never sent to browsers).
 */
export type Provider = "openai" | "gemini" | "anthropic";
export type AiConfig = { provider: Provider; key: string; model: string; source: "environment" | "portal settings" };
export const PROVIDER_LABEL: Record<Provider, string> = { openai: "OpenAI", gemini: "Google Gemini", anthropic: "Anthropic Claude" };

async function setting(key: string) {
  try {
    const r = await localDb().execute(sql`select value from portal_settings where key = ${key}`);
    return (r.rows[0] as { value?: string } | undefined)?.value ?? null;
  } catch {
    return null;
  }
}
async function setSetting(key: string, value: string | null) {
  if (value === null) await localDb().execute(sql`delete from portal_settings where key = ${key}`);
  else await localDb().execute(sql`insert into portal_settings (key, value) values (${key}, ${value}) on conflict (key) do update set value = excluded.value, updated_at = now()`);
}

const DEFAULT_MODEL: Record<Provider, string> = { openai: "gpt-4o-mini", gemini: "gemini-2.0-flash", anthropic: "claude-3-5-haiku-latest" };

export async function aiConfig(): Promise<AiConfig | null> {
  const env: [Provider, string | undefined, string | undefined][] = [
    ["openai", process.env.OPENAI_API_KEY, process.env.OPENAI_MODEL],
    ["gemini", process.env.GEMINI_API_KEY, process.env.GEMINI_MODEL],
    ["anthropic", process.env.ANTHROPIC_API_KEY, process.env.ANTHROPIC_MODEL],
  ];
  for (const [provider, key, model] of env) if (key?.trim()) return { provider, key: key.trim(), model: model?.trim() || DEFAULT_MODEL[provider], source: "environment" };
  const provider = (await setting("ai_provider")) as Provider | null;
  const key = await setting("ai_api_key");
  if (!provider || !key || !(provider in PROVIDER_LABEL)) return null;
  return { provider, key, model: (await setting("ai_model")) || DEFAULT_MODEL[provider], source: "portal settings" };
}

const timeout = () => AbortSignal.timeout(60_000);

/** Lists the models this key can use and picks a suitable one. Throws a readable error if the key is refused. */
export async function chooseModel(provider: Provider, key: string): Promise<string> {
  let ids: string[] = [];
  if (provider === "openai") {
    const r = await fetch("https://api.openai.com/v1/models", { headers: { Authorization: `Bearer ${key}` }, signal: timeout() });
    if (!r.ok) throw new Error(`OpenAI refused the key (HTTP ${r.status}).`);
    ids = ((await r.json()).data ?? []).map((m: { id: string }) => m.id);
    const pick = [/^gpt-4\.1-mini$/, /^gpt-4o-mini$/, /^gpt-5-mini$/, /^gpt-4\.1$/, /^gpt-4o$/, /^gpt-.*mini$/].map((re) => ids.find((i) => re.test(i))).find(Boolean);
    if (pick) return pick;
  } else if (provider === "gemini") {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(key)}&pageSize=200`, { signal: timeout() });
    if (!r.ok) throw new Error(`Google refused the key (HTTP ${r.status}).`);
    const models = ((await r.json()).models ?? []) as { name: string; supportedGenerationMethods?: string[] }[];
    ids = models.filter((m) => m.supportedGenerationMethods?.includes("generateContent")).map((m) => m.name.replace(/^models\//, ""));
    const pick = [/^gemini-[\d.]+-flash$/, /^gemini-flash-latest$/, /^gemini-[\d.]+-flash(-\d+)?$/, /flash(?!.*(lite|exp|preview|image|tts|live))/].map((re) => ids.find((i) => re.test(i))).find(Boolean);
    if (pick) return pick;
  } else {
    const r = await fetch("https://api.anthropic.com/v1/models?limit=100", { headers: { "x-api-key": key, "anthropic-version": "2023-06-01" }, signal: timeout() });
    if (!r.ok) throw new Error(`Anthropic refused the key (HTTP ${r.status}).`);
    ids = ((await r.json()).data ?? []).map((m: { id: string }) => m.id);
    const pick = [/haiku/, /sonnet/].map((re) => ids.find((i) => re.test(i))).find(Boolean);
    if (pick) return pick;
  }
  if (ids.length) return ids[0];
  throw new Error("This key cannot use any text model.");
}

export async function saveAiSettings(provider: Provider, key: string, model: string) {
  await setSetting("ai_provider", provider);
  await setSetting("ai_api_key", key);
  await setSetting("ai_model", model);
}
export async function clearAiSettings() {
  for (const k of ["ai_provider", "ai_api_key", "ai_model"]) await setSetting(k, null);
}

/** Sends one prompt and returns the reply text. */
export async function askAI(cfg: AiConfig, prompt: string): Promise<string> {
  if (cfg.provider === "openai") {
    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST", signal: timeout(),
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${cfg.key}` },
      body: JSON.stringify({ model: cfg.model, messages: [{ role: "user", content: prompt }] }),
    });
    if (!r.ok) throw new Error(`OpenAI error ${r.status}: ${(await r.text()).slice(0, 160)}`);
    return (await r.json()).choices?.[0]?.message?.content ?? "";
  }
  if (cfg.provider === "gemini") {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(cfg.model)}:generateContent?key=${encodeURIComponent(cfg.key)}`, {
      method: "POST", signal: timeout(), headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
    });
    if (!r.ok) throw new Error(`Gemini error ${r.status}: ${(await r.text()).slice(0, 160)}`);
    return (await r.json()).candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? "").join("") ?? "";
  }
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST", signal: timeout(),
    headers: { "Content-Type": "application/json", "x-api-key": cfg.key, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: cfg.model, max_tokens: 4000, messages: [{ role: "user", content: prompt }] }),
  });
  if (!r.ok) throw new Error(`Anthropic error ${r.status}: ${(await r.text()).slice(0, 160)}`);
  return (await r.json()).content?.map((p: { text?: string }) => p.text ?? "").join("") ?? "";
}

/** Extracts the first JSON array from a model reply. */
export function jsonArray<T>(text: string): T[] {
  const cleaned = text.replace(/```json|```/g, "").trim();
  const start = cleaned.indexOf("[");
  const end = cleaned.lastIndexOf("]");
  if (start < 0 || end <= start) throw new Error("The AI reply did not contain a list.");
  return JSON.parse(cleaned.slice(start, end + 1)) as T[];
}
