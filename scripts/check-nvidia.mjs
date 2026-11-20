#!/usr/bin/env node
/**
 * One-shot NVIDIA check. Run:  npm run ai:check
 *
 * It reads .env.local (never committed), sends ONE tiny streamed request and
 * prints the provider's reasoning and answer. The key is never printed.
 */
import { config } from "dotenv";
import OpenAI from "openai";

config({ path: ".env.local", quiet: true });
config({ quiet: true });

const key = (process.env.NVIDIA_API_KEY ?? "").trim();
const model = (process.env.NVIDIA_MODEL ?? "").trim() || "nvidia/nemotron-3-ultra-550b-a55b";
const baseURL = (process.env.NVIDIA_BASE_URL ?? "").trim() || "https://integrate.api.nvidia.com/v1";

if (!key) {
  console.error(
    [
      "",
      "NVIDIA_API_KEY is empty.",
      "  1. Copy .env.example to .env.local  ->  cp .env.example .env.local",
      "  2. Get a key at https://build.nvidia.com and paste it after NVIDIA_API_KEY=",
      "  3. Run this again.",
      "",
    ].join("\n"),
  );
  process.exit(1);
}

const client = new OpenAI({ apiKey: key, baseURL, maxRetries: 0, timeout: 60_000 });
const started = Date.now();

console.log(`Model:  ${model}`);
console.log(`Base:   ${baseURL}`);
console.log("Sending one streamed test message…\n");

try {
  const stream = await client.chat.completions.create({
    model,
    messages: [
      { role: "system", content: "Answer in one short sentence. No preamble." },
      { role: "user", content: "What is a GPU, in one sentence?" },
    ],
    temperature: 1,
    top_p: 0.95,
    max_tokens: 512,
    stream: true,
    ...(process.env.NVIDIA_ENABLE_THINKING === "false"
      ? {}
      : { chat_template_kwargs: { enable_thinking: true } }),
  });

  let answer = "";
  let reasoning = "";
  let firstTokenAt = null;
  for await (const chunk of stream) {
    const delta = chunk.choices?.[0]?.delta ?? {};
    if (delta.reasoning_content) {
      firstTokenAt ??= Date.now();
      reasoning += delta.reasoning_content;
    }
    if (delta.content) {
      firstTokenAt ??= Date.now();
      answer += delta.content;
    }
  }

  console.log(`First token: ${firstTokenAt ? `${firstTokenAt - started} ms` : "none"}`);
  console.log(`Reasoning:   ${reasoning ? `${reasoning.length} characters (hidden in the app)` : "none"}`);
  console.log("\nAnswer:\n" + (answer.trim() || "(empty)"));
  console.log(`\nTotal: ${Date.now() - started} ms · PASS`);
  if (!answer.trim()) {
    console.error("\nThe stream finished without an answer. Check NVIDIA_MODEL.");
    process.exit(1);
  }
} catch (error) {
  console.error("\nFAIL:", error?.message ?? error);
  if (error?.status) console.error("HTTP status:", error.status);
  console.error(
    "\nCurl version of this test (paste your key where shown):\n" +
      `curl -sS https://integrate.api.nvidia.com/v1/chat/completions \\\n` +
      `  -H "Authorization: Bearer $NVIDIA_API_KEY" \\\n` +
      `  -H "Content-Type: application/json" \\\n` +
      `  -d '{"model":"${model}","messages":[{"role":"user","content":"Say hi"}],"max_tokens":32,"stream":false}'`,
  );
  process.exit(1);
}
