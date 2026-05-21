// Generates a per-merchant bearer token, stores its bcrypt hash in
// agent_api_tokens, then PATCHes the merchant's EL agent with 5 tool
// definitions (pause/coupon/send-link/log-callback/log-churn).
//
// Idempotent: skips token regen if one already exists; tool list is
// always overwritten.

import "../src/env";

import { randomBytes } from "node:crypto";
import { Pool } from "pg";
import { requireEnv } from "../src/env";

const DB = process.env.PROD_DATABASE_URL ?? requireEnv("DATABASE_URL");
const APP_URL = requireEnv("APP_URL");
const EL_KEY = requireEnv("EL_KEY");

const pool = new Pool({ connectionString: DB, max: 2, connectionTimeoutMillis: 8000 });

const merchant = (
  await pool.query(
    "SELECT id, name, agent_id FROM merchants WHERE name LIKE '%winsznx%' LIMIT 1",
  )
).rows[0];
if (!merchant || !merchant.agent_id) {
  console.error("no merchant or no agent_id", merchant);
  process.exit(1);
}
console.log("merchant:", merchant.id, "agent:", merchant.agent_id);

// 1. Bearer token: "merchant_<id>.<32-byte-hex-secret>"
const existingTok = await pool.query(
  "SELECT id FROM agent_api_tokens WHERE merchant_id = $1",
  [merchant.id],
);
let bearer: string;
if (existingTok.rows[0]) {
  console.log("[1/2] token row exists — minting a new secret and rotating");
  await pool.query("DELETE FROM agent_api_tokens WHERE merchant_id = $1", [
    merchant.id,
  ]);
}
const secret = randomBytes(32).toString("hex");
bearer = `merchant_${merchant.id}.${secret}`;
const hash = await Bun.password.hash(secret);
await pool.query(
  "INSERT INTO agent_api_tokens (merchant_id, token_hash) VALUES ($1, $2)",
  [merchant.id, hash],
);
console.log("[1/2] bearer minted (will be embedded in EL tool headers)");

// 2. Register tools on the agent. Use EL's PATCH /v1/convai/agents/:agentId
//    with conversation_config.agent.prompt.tools.
const recoveryIdParam = {
  name: "recovery_id",
  type: "string",
  description: "Pass the {{recovery_id}} dynamic variable for this call.",
  required: true,
  value_type: "llm_prompt",
  // ^ instructs EL to ask the model to supply it; we'll also prime in prompt.
};

type ToolProp = {
  type: "string" | "number" | "integer";
  description: string;
};

function tool(
  name: string,
  description: string,
  endpoint: string,
  properties: Record<string, ToolProp>,
  required: string[],
) {
  return {
    type: "webhook",
    name,
    description,
    response_timeout_secs: 10,
    api_schema: {
      // {{recovery_id}} is filled by EL from the call's dynamic variables —
      // declared in query_params_schema below with value_type "dynamic_variable".
      // The agent never has to think about it.
      url: `${APP_URL}/stripe-actions/${endpoint}`,
      method: "POST",
      query_params_schema: {
        properties: {
          recovery_id: {
            type: "string",
            value_type: "dynamic_variable",
            dynamic_variable: "recovery_id",
          },
        },
        required: ["recovery_id"],
      },
      request_headers: {
        Authorization: `Bearer ${bearer}`,
        "Content-Type": "application/json",
      },
      request_body_schema: {
        type: "object",
        required,
        properties,
      },
    },
  };
}

const tools = [
  tool(
    "pause_subscription",
    "Pause the customer's subscription. Use when the customer wants a break but not to cancel. Use behavior='keep_as_draft' (default) so invoices still draft during pause, or 'void' to skip them entirely. resumes_in_days must be 7, 14, or 30.",
    "pause-subscription",
    {
      behavior: {
        type: "string",
        description:
          "One of 'keep_as_draft' (default), 'void', 'mark_uncollectible'.",
      },
      resumes_in_days: {
        type: "integer",
        description: "When the pause ends. Must be 7, 14, or 30.",
      },
    },
    [],
  ),
  tool(
    "apply_coupon",
    "Apply a discount to this customer's subscription. Use when the customer says it's too expensive. percent_off must be between 5 and 20.",
    "apply-coupon",
    {
      percent_off: {
        type: "integer",
        description: "Discount percent. Must be 5, 10, 15, or 20.",
      },
      duration: {
        type: "string",
        description:
          "How long the discount applies. 'once' (single invoice) or 'repeating' (multiple months).",
      },
      duration_in_months: {
        type: "integer",
        description:
          "If duration is 'repeating', how many months. Default 3. Ignored for 'once'.",
      },
    },
    ["percent_off"],
  ),
  tool(
    "send_recovery_link",
    "Text the customer a fresh hosted invoice link they can pay from any browser. Use after confirming the customer wants to pay but needs a moment.",
    "send-recovery-link",
    {},
    [],
  ),
  tool(
    "log_callback",
    "Record that the customer wants a human to call them back. Capture their preferred time window.",
    "log-callback",
    {
      preferred_time: {
        type: "string",
        description:
          "Customer's stated preferred callback time, e.g. 'tomorrow morning' or 'after 5pm Wednesday'.",
      },
      notes: {
        type: "string",
        description: "Anything else the customer mentioned the human should know.",
      },
    },
    [],
  ),
  tool(
    "log_churn",
    "Record that the customer explicitly cancels. Capture the reason. Use only after confirming they understand the cancellation is final.",
    "log-churn",
    {
      reason: {
        type: "string",
        description:
          "Free-text reason the customer gave for cancelling (e.g. 'switching to competitor X', 'no longer using').",
      },
      notes: {
        type: "string",
        description: "Anything else worth recording.",
      },
    },
    [],
  ),
];

console.log(
  `[2/2a] creating ${tools.length} tools at workspace level on EL…`,
);

// Clean up any prior Dunner tools so re-runs don't accrete.
const existingList = await fetch(
  "https://api.elevenlabs.io/v1/convai/tools",
  { headers: { "xi-api-key": EL_KEY } },
).then((r) => r.json() as Promise<{ tools?: Array<{ id: string; tool_config?: { name?: string } }> }>);
const dunnerNames = new Set(tools.map((t) => t.name));
for (const ex of existingList.tools ?? []) {
  if (ex.tool_config?.name && dunnerNames.has(ex.tool_config.name)) {
    await fetch(`https://api.elevenlabs.io/v1/convai/tools/${ex.id}`, {
      method: "DELETE",
      headers: { "xi-api-key": EL_KEY },
    });
  }
}

const toolIds: string[] = [];
for (const t of tools) {
  const res = await fetch("https://api.elevenlabs.io/v1/convai/tools", {
    method: "POST",
    headers: { "xi-api-key": EL_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ tool_config: t }),
  });
  const body = await res.text();
  if (!res.ok) {
    console.error(`  ${t.name} FAIL ${res.status}: ${body.slice(0, 300)}`);
    process.exit(1);
  }
  const json = JSON.parse(body) as { id?: string };
  if (!json.id) {
    console.error(`  ${t.name} no id in response: ${body.slice(0, 300)}`);
    process.exit(1);
  }
  toolIds.push(json.id);
  console.log(`  ${t.name} -> ${json.id}`);
}

console.log(`[2/2b] attaching ${toolIds.length} tool_ids to agent`);
const patchBody = {
  conversation_config: {
    agent: { prompt: { tool_ids: toolIds } },
  },
};
const patchRes = await fetch(
  `https://api.elevenlabs.io/v1/convai/agents/${merchant.agent_id}`,
  {
    method: "PATCH",
    headers: { "xi-api-key": EL_KEY, "Content-Type": "application/json" },
    body: JSON.stringify(patchBody),
  },
);
const patchText = await patchRes.text();
if (!patchRes.ok) {
  console.error("agent patch failed:", patchRes.status, patchText);
  process.exit(1);
}
const parsed = JSON.parse(patchText);
const finalIds: string[] =
  parsed.conversation_config?.agent?.prompt?.tool_ids ?? [];
console.log(`  agent now has ${finalIds.length} tool_ids: ${finalIds.join(", ")}`);

await pool.end();

console.log("\nNext step: deploy the backend so it picks up the new tool routes.");
console.log("(Tools fire from EL → backend; backend MUST be live + reachable.)");
