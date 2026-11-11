"use server";

import { requireUser } from "@/lib/auth";
import { chooseModel, clearAiSettings, saveAiSettings, type Provider } from "@/lib/ai";
import { go, str } from "./helpers";

const PAGE = "/dashboard/ai-assistant";

export async function saveAiKeyAction(formData: FormData) {
  await requireUser(["super_admin"]);
  const provider = str(formData, "provider") as Provider;
  const key = str(formData, "key");
  if (!["openai", "gemini", "anthropic"].includes(provider)) go(PAGE, "Choose a provider.", "err");
  if (key.length < 20) go(PAGE, "Paste the whole API key.", "err");
  let model = "";
  try {
    model = await chooseModel(provider, key); // also proves the key works
  } catch (e) {
    go(PAGE, (e as Error).message, "err");
  }
  await saveAiSettings(provider, key, model);
  go(PAGE, `AI key saved and checked. Using model ${model}.`);
}

export async function clearAiKeyAction() {
  await requireUser(["super_admin"]);
  await clearAiSettings();
  go(PAGE, "AI key removed. The question tools now use the offline generator only.");
}
