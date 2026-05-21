// One-shot admin script: finishes onboarding for a merchant on prod by
// (1) uploading the synthetic IVC mp3 to ElevenLabs, (2) creating the KB doc,
// (3) creating the per-merchant agent with voice + KB attached, (4) writing
// the resulting voice_id / doc_id / agent_id back to the merchant row.
//
// Mirrors exactly what /onboarding/voice/upload + /onboarding/knowledge would
// do — used here only because the iOS simulator's keyboard is unresponsive
// and we can't drive the mobile form. Delete this file after demo.

import "../src/env";

import { readFile } from "node:fs/promises";
import { Pool } from "pg";
import {
  buildFirstMessage,
  buildSystemPrompt,
  createAgent,
  createIVC,
  createKnowledgeBaseDoc,
} from "../src/services/elevenlabs";
import { requireEnv } from "../src/env";

const PROD_DB =
  process.env.PROD_DATABASE_URL ?? requireEnv("DATABASE_URL");
const MP3 = process.env.MP3_PATH ?? "/tmp/dunner-prod/sample.mp3";
const KB_CONTENT = `PLANS & PRICING
- Starter: $19/mo, 1 seat, up to 200 contacts
- Pro: $49/mo, 5 seats, unlimited contacts, priority support
- Annual billing is 20% off both plans
- We never raise prices on existing customers

COMMON OBJECTIONS
- "Too expensive" -> offer 15% off for 3 months on the same plan; if still no, downgrade to Starter
- "Not using it enough" -> offer a 30-day pause; subscription resumes automatically
- "Switching to a competitor" -> ask which one, log it, offer 1 free month
- "I forgot to cancel" -> no refund past 14 days, but offer a pause or downgrade

REFUND POLICY
- Within 14 days of charge: full refund, no questions
- Past 14 days: non-refundable
- Annual plans: pro-rated refund only in the first 30 days
`;

const pool = new Pool({ connectionString: PROD_DB, max: 2, connectionTimeoutMillis: 8000 });

const merchant = (
  await pool.query(
    "SELECT id, name, default_voice_id, agent_id FROM merchants WHERE name LIKE '%winsznx%' LIMIT 1",
  )
).rows[0];
if (!merchant) {
  console.error("no merchant found");
  process.exit(1);
}
console.log("merchant:", merchant);

// 1. IVC
let voiceId = merchant.default_voice_id as string | null;
if (!voiceId) {
  console.log("[1/3] creating IVC from", MP3);
  await readFile(MP3); // throws if missing
  const r = await createIVC(`Merchant ${merchant.id} voice`, MP3);
  voiceId = r.voice_id;
  await pool.query("UPDATE merchants SET default_voice_id = $1 WHERE id = $2", [
    voiceId,
    merchant.id,
  ]);
  console.log("  voice_id:", voiceId);
} else {
  console.log("[1/3] voice already exists:", voiceId);
}

// 2. KB doc
const existingKb = await pool.query(
  "SELECT id, eleven_labs_doc_id FROM knowledge_base_docs WHERE merchant_id = $1",
  [merchant.id],
);
let kbDocId: string;
let kbName: string;
if (existingKb.rows[0]?.eleven_labs_doc_id) {
  kbDocId = existingKb.rows[0].eleven_labs_doc_id;
  const t = await pool.query(
    "SELECT title FROM knowledge_base_docs WHERE id = $1",
    [existingKb.rows[0].id],
  );
  kbName = t.rows[0].title;
  console.log("[2/3] KB doc already exists:", kbDocId);
} else {
  console.log("[2/3] creating KB doc");
  kbName = `${merchant.name} product knowledge`;
  const r = await createKnowledgeBaseDoc(kbName, KB_CONTENT);
  kbDocId = r.id;
  await pool.query(
    "DELETE FROM knowledge_base_docs WHERE merchant_id = $1",
    [merchant.id],
  );
  await pool.query(
    "INSERT INTO knowledge_base_docs (merchant_id, title, content, eleven_labs_doc_id) VALUES ($1, $2, $3, $4)",
    [merchant.id, kbName, KB_CONTENT, kbDocId],
  );
  console.log("  kb doc_id:", kbDocId);
}

// 3. Agent
let agentId = merchant.agent_id as string | null;
if (!agentId) {
  console.log("[3/3] creating agent");
  const r = await createAgent({
    name: `Dunner: ${merchant.name}`,
    prompt: buildSystemPrompt(merchant.name),
    firstMessage: buildFirstMessage(merchant.name),
    voiceId: voiceId!,
    knowledgeBaseDocId: kbDocId,
    knowledgeBaseDocName: kbName,
  });
  agentId = r.agent_id;
  await pool.query("UPDATE merchants SET agent_id = $1 WHERE id = $2", [
    agentId,
    merchant.id,
  ]);
  console.log("  agent_id:", agentId);
} else {
  console.log("[3/3] agent already exists:", agentId);
}

console.log("\nFinal merchant state:");
const final = await pool.query(
  "SELECT name, stripe_account_status, default_voice_id, agent_id FROM merchants WHERE id = $1",
  [merchant.id],
);
console.log(final.rows[0]);

await pool.end();
