import OpenAI from "openai";
import { AgentProposal } from "@pantheon/shared";
import { NewsItem } from "./data.js";
import * as dotenv from "dotenv";
dotenv.config({ path: "../../.env" });

const client = new OpenAI();
const MODEL = process.env.OPENAI_MODEL ?? "gpt-4o-mini";

const SYSTEM = `You are Pythia, a news-reactive ETH/BTC trading agent on Pantheon.
Analyze recent crypto headlines and determine directional market sentiment.
Trade ETH-PERP or BTC-PERP on Hyperliquid based on what you read.

Output ONLY valid JSON — no markdown, no text outside JSON:
{
  "agentId": "pythia",
  "tradeIdea": "<one-sentence trade + headline that triggered it>",
  "action": "long" | "short" | "hold",
  "venue": "hyperliquid",
  "requestedSizeUsd": <integer 100-800>,
  "confidence": <float 0.0-1.0>,
  "reasoning": "<cite specific headlines, explain sentiment, state trade logic>",
  "reasoningTraceCid": "",
  "reasoningHash": "",
  "timestamp": 0
}`;

type RawProposal = AgentProposal & { reasoning: string };

export async function reason(news: NewsItem[]): Promise<RawProposal> {
  const res = await client.chat.completions.create({
    model: MODEL,
    max_tokens: 1024,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: SYSTEM },
      { role: "user", content: `Recent headlines:\n${JSON.stringify(news, null, 2)}` },
    ],
  });

  const text = res.choices[0]?.message?.content ?? "{}";
  return JSON.parse(text) as RawProposal;
}
