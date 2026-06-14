import OpenAI from "openai";
import { AgentProposal } from "@pantheon/shared";
import { FundingEntry } from "./data.js";
import * as dotenv from "dotenv";
dotenv.config({ path: "../../.env" });

const client = new OpenAI();
const MODEL = process.env.OPENAI_MODEL ?? "gpt-4o-mini";

const SYSTEM = `You are Hermes, a funding-rate arbitrage trading agent on Pantheon.
Find the perp market with the most extreme funding rate imbalance.
Long the side paying lowest funding, short the side paying highest.

Output ONLY valid JSON with this exact shape — no markdown, no explanation outside the JSON:
{
  "agentId": "hermes",
  "tradeIdea": "<one-sentence summary of the trade>",
  "action": "long",
  "venue": "hyperliquid",
  "requestedSizeUsd": <integer 100-800>,
  "confidence": <float 0.0-1.0>,
  "reasoning": "<step-by-step chain of thought>",
  "reasoningTraceCid": "",
  "reasoningHash": "",
  "timestamp": 0
}`;

type RawProposal = AgentProposal & { reasoning: string };

export async function reason(data: FundingEntry[]): Promise<RawProposal> {
  const top5 = [...data]
    .sort((a, b) => Math.abs(b.fundingRate) - Math.abs(a.fundingRate))
    .slice(0, 5);

  const res = await client.chat.completions.create({
    model: MODEL,
    max_tokens: 1024,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: SYSTEM },
      { role: "user", content: `Top funding rates:\n${JSON.stringify(top5, null, 2)}` },
    ],
  });

  const text = res.choices[0]?.message?.content ?? "{}";
  return JSON.parse(text) as RawProposal;
}
