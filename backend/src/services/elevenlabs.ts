import "../env";

import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import { requireEnv } from "../env";

const EL_BASE = "https://api.elevenlabs.io";
const apiKey = requireEnv("EL_KEY");

export class ElevenLabsError extends Error {
  constructor(
    public status: number,
    public body: string,
    message?: string,
  ) {
    super(message ?? `ElevenLabs request failed: ${status} ${body.slice(0, 200)}`);
  }
}

export async function createIVC(
  name: string,
  mp3Path: string,
): Promise<{ voice_id: string }> {
  const bytes = await readFile(mp3Path);
  const fileName = basename(mp3Path);

  const formData = new FormData();
  formData.append("name", name);
  formData.append("remove_background_noise", "true");
  formData.append(
    "files",
    new Blob([new Uint8Array(bytes)], { type: "audio/mpeg" }),
    fileName,
  );

  const res = await fetch(`${EL_BASE}/v1/voices/add`, {
    method: "POST",
    headers: { "xi-api-key": apiKey },
    body: formData,
  });

  const text = await res.text();
  if (!res.ok) {
    throw new ElevenLabsError(res.status, text);
  }

  const json = JSON.parse(text) as { voice_id?: string };
  if (!json.voice_id) {
    throw new ElevenLabsError(
      res.status,
      text,
      "ElevenLabs returned 2xx without voice_id",
    );
  }

  return { voice_id: json.voice_id };
}

export async function createKnowledgeBaseDoc(
  name: string,
  text: string,
): Promise<{ id: string }> {
  const res = await fetch(`${EL_BASE}/v1/convai/knowledge-base/text`, {
    method: "POST",
    headers: {
      "xi-api-key": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ name, text }),
  });

  const body = await res.text();
  if (!res.ok) {
    throw new ElevenLabsError(res.status, body);
  }
  const json = JSON.parse(body) as { id?: string };
  if (!json.id) {
    throw new ElevenLabsError(res.status, body, "KB create returned no id");
  }
  return { id: json.id };
}

export type AgentSpec = {
  name: string;
  prompt: string;
  firstMessage: string;
  voiceId: string;
  knowledgeBaseDocId: string;
  knowledgeBaseDocName: string;
};

export async function createAgent(spec: AgentSpec): Promise<{ agent_id: string }> {
  const body = {
    name: spec.name,
    conversation_config: {
      agent: {
        first_message: spec.firstMessage,
        language: "en",
        prompt: {
          prompt: spec.prompt,
          knowledge_base: [
            {
              type: "text",
              name: spec.knowledgeBaseDocName,
              id: spec.knowledgeBaseDocId,
            },
          ],
        },
      },
      tts: { voice_id: spec.voiceId },
    },
  };

  const res = await fetch(`${EL_BASE}/v1/convai/agents/create`, {
    method: "POST",
    headers: {
      "xi-api-key": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const respText = await res.text();
  if (!res.ok) {
    throw new ElevenLabsError(res.status, respText);
  }
  const json = JSON.parse(respText) as { agent_id?: string };
  if (!json.agent_id) {
    throw new ElevenLabsError(
      res.status,
      respText,
      "Agent create returned no agent_id",
    );
  }
  return { agent_id: json.agent_id };
}

// Template per CLAUDE.md §10. Dynamic variables {{...}} are filled at call
// time via the outbound-call dynamic_variables payload — they stay as literal
// placeholders in the agent's stored prompt.
export function buildSystemPrompt(merchantName: string): string {
  return `You are ${merchantName}'s recovery agent calling {{customer_name}} about an overdue
{{plan}} subscription ({{amount_due}} {{currency}} past due). The customer's card declined
during the most recent billing attempt.

You speak in ${merchantName}'s actual voice — you are not a bot, you represent them.

GOAL: Reach one of these outcomes, in order of preference:
1. Same-card recovery: customer authorizes the same card again (rare but possible)
2. New card on file: customer provides a new payment method, charge succeeds
3. Plan downgrade: keeps customer at lower tier
4. One-time recovery coupon (max 20% off this invoice)
5. Pause subscription (max 30 days) — keeps customer warm
6. Informed churn: customer explicitly cancels — log reason and end gracefully

RULES:
- Never claim to be human if asked directly. Say "I'm an AI calling on behalf of ${merchantName} —
  but I have full authority to make changes on their behalf."
- Confirm every agreement explicitly before calling a tool: "So we're agreed on
  [specific action] — can I go ahead and make that change now?"
- After confirming, immediately use the appropriate tool.
- Before any tool call, say a short bridging phrase like "give me one moment" — do NOT
  wait silently while the tool runs.
- Do not repeat the same offer more than twice.
- Maximum 4 turns per objection before pivoting.
- If the customer is abusive (insults, threats, explicit language) after one warning,
  end the call.
- If asked for a human, log a callback request and say "Our team will reach out within
  one business day at a time that works for you."`;
}

export function buildFirstMessage(merchantName: string): string {
  return `Hi {{customer_name}}, this is ${merchantName} calling about your subscription. Do you have a moment?`;
}
