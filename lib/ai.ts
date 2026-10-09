// The ONLY place in this project that talks to an LLM.
// Switch providers by setting AI_PROVIDER in .env.local ("gemini" or "claude").
// No other file should import an AI SDK or call an AI API directly.

type Provider = "gemini" | "claude";

// Defaults can be overridden with GEMINI_MODEL / CLAUDE_MODEL in .env.local.
const DEFAULT_GEMINI_MODEL = "gemini-3.8-flash"; // free-tier Flash model
const DEFAULT_CLAUDE_MODEL = "claude-haiku-5-5";

function getProvider(): Provider {
  const raw = (process.env.AI_PROVIDER ?? "gemini").trim().toLowerCase();
  if (raw === "gemini" || raw === "claude") return raw;
  throw new Error(`Unknown AI_PROVIDER "${raw}". Use "gemini" or "claude".`);
}

function requireKey(name: string): string {
  const key = process.env[name];
  if (!key) throw new Error(`${name} is missing. Add it to .env.local and restart the dev server.`);
  return key;
}

async function askGemini(prompt: string, system?: string): Promise<string> {
  const model = process.env.GEMINI_MODEL ?? DEFAULT_GEMINI_MODEL;
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": requireKey("GEMINI_API_KEY"),
      },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        ...(system && { systemInstruction: { parts: [{ text: system }] } }),
      }),
    },
  );
  if (!res.ok) throw new Error(`Gemini error ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const parts: { text?: string }[] = data.candidates?.[0]?.content?.parts ?? [];
  return parts.map((p) => p.text ?? "").join("").trim();
}

async function askClaude(prompt: string, system?: string): Promise<string> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": requireKey("ANTHROPIC_API_KEY"),
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: process.env.CLAUDE_MODEL ?? DEFAULT_CLAUDE_MODEL,
      max_tokens: 1024,
      ...(system && { system }),
      messages: [{ role: "user", content: prompt }],
    }),
  });
  if (!res.ok) throw new Error(`Claude error ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const blocks: { type: string; text?: string }[] = data.content ?? [];
  return blocks.filter((b) => b.type === "text").map((b) => b.text).join("").trim();
}

/** Send a prompt to the configured AI provider and get plain text back. */
export async function askAI(prompt: string, system?: string): Promise<string> {
  return getProvider() === "claude" ? askClaude(prompt, system) : askGemini(prompt, system);
}
