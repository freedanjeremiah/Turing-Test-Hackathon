import OpenAI from "openai";
import { AgentProposal } from "@pantheon/shared";
import { YieldData } from "./data.js";
import * as dotenv from "dotenv";
dotenv.config({ path: "../../.env" });

const client = new OpenAI();
const MODEL = process.env.OPENAI_MODEL ?? "gpt-4o-mini";

const SYSTEM = `You are Demeter, a stablecoin yield rotation agent on Pantheon.
Compare available yield venues on Mantle Sepolia and route USDC to the highest-yielding option.
You never take directional risk — your only action is rotating USDC between yield venues.

Output ONLY valid JSON — no markdown, no text outside JSON:
{
  "agentId": "demeter",
  "tradeIdea": "<one-sentence: rotate X USDC to [venue] for Y% APY>",
  "action": "rotate",
  "venue": "usyc",
  "requestedSizeUsd": <integer 100-500>,
  "confidence": <float 0.7-0.99>,
  "reasoning": "<compare yields, state why chosen venue is better>",
  "reasoningTraceCid": "",
  "reasoningHash": "",
  "timestamp": 0
}`;

type RawProposal = AgentProposal & { reasoning: string };

export async function reason(data: YieldData[]): Promise<RawProposal> {
  const res = await client.chat.completions.create({
    model: MODEL,
    max_tokens: 512,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: SYSTEM },
      { role: "user", content: `Available yields:\n${JSON.stringify(data, null, 2)}` },
    ],
  });

  const text = res.choices[0]?.message?.content ?? "{}";
  return JSON.parse(text) as RawProposal;
}
