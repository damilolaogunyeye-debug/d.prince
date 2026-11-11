import { requireUser } from "@/lib/auth";
import { aiConfig, PROVIDER_LABEL } from "@/lib/ai";
import { clearAiKeyAction, saveAiKeyAction } from "@/lib/actions/ai";
import { Flash, PageHeader } from "@/components/ui";

export default async function AiAssistantPage({ searchParams }: { searchParams: Promise<{ msg?: string; err?: string }> }) {
  const me = await requireUser(["staff", "super_admin"]);
  const { msg, err } = await searchParams;
  const cfg = await aiConfig();
  const isSuper = me.role === "super_admin";

  return (
    <div>
      <PageHeader title="AI Assistant for CBT questions" subtitle="Tools that help staff set CBT questions. Open any CBT test and use the tools above the question list." />
      <Flash msg={msg} err={err} />

      <div className={`card mb-6 ${cfg ? "border-emerald-300" : "border-amber-300"}`}>
        <h2 className="font-semibold">Status</h2>
        {cfg ? (
          <p className="mt-1 text-sm text-slate-700">AI is <b className="text-emerald-700">on</b>: {PROVIDER_LABEL[cfg.provider]}, model <span className="font-mono">{cfg.model}</span> (set in {cfg.source}).</p>
        ) : (
          <p className="mt-1 text-sm text-slate-700">AI is <b className="text-amber-700">off</b>: no AI key is set up. The tools still work offline (question drafts from your notes, pasted-question import, question checks), but AI generation and AI review need a key.</p>
        )}
      </div>

      <div className="card mb-6">
        <h2 className="font-semibold">The tools (on every CBT test page)</h2>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-700">
          <li><b>AI Question Assistant</b>: generate draft multiple-choice questions from a topic and your lesson notes. With a key, an AI writes them; without, an offline generator builds them from your notes. Every draft is shown for checking and editing before it is added.</li>
          <li><b>Paste typed questions</b>: paste questions typed from a past paper or document (numbered questions, options A–D, &ldquo;Answer: C&rdquo;) and they become CBT questions. No AI needed.</li>
          <li><b>Check questions</b>: finds duplicate questions, identical or empty options, answers that give themselves away, and lopsided answer letters. With a key, the AI also checks whether each marked answer is really correct and whether questions are unclear.</li>
          <li><b>Import</b>: CSV or JSON files.</li>
        </ul>
        <p className="mt-2 text-xs text-slate-500">AI can make mistakes. Always read generated questions and AI review comments before using them in an exam.</p>
      </div>

      {isSuper ? (
        <form action={saveAiKeyAction} className="card space-y-3">
          <h2 className="font-semibold">{cfg?.source === "portal settings" ? "Change the AI key" : "Add an AI key"}</h2>
          <p className="text-sm text-slate-600">
            Any one provider is enough. Google Gemini offers a free allowance: create a key at aistudio.google.com/apikey. OpenAI and Anthropic keys are paid.
            The key is checked with the provider before saving, kept on the server and never shown again.
          </p>
          <div className="grid gap-3 sm:grid-cols-3">
            <div><label className="label">Provider</label>
              <select name="provider" defaultValue={cfg?.provider ?? "gemini"} className="input"><option value="gemini">Google Gemini</option><option value="openai">OpenAI</option><option value="anthropic">Anthropic Claude</option></select></div>
            <div className="sm:col-span-2"><label className="label">API key</label><input name="key" type="password" autoComplete="off" required className="input font-mono" /></div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button className="btn-primary">Check and save key</button>
          </div>
          {cfg?.source === "environment" && <p className="text-xs text-slate-500">A key in the environment takes priority over one saved here.</p>}
        </form>
      ) : (
        <p className="text-sm text-slate-500">Only the Super Admin can add or change the AI key.</p>
      )}
      {isSuper && cfg?.source === "portal settings" && (
        <form action={clearAiKeyAction} className="mt-3"><button className="text-sm font-medium text-red-700 hover:underline">Remove the saved AI key</button></form>
      )}
    </div>
  );
}
