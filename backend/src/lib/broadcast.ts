import type { WSContext } from "hono/ws";
import type { WsEvent, CallSnapshot } from "./ws-events";

// Module-level registry. Per-recovery set of live subscribers.
// Cleared on disconnect in routes/ws.ts.
const callSubscribers = new Map<string, Set<WSContext>>();
const merchantSubscribers = new Map<string, Set<WSContext>>();

export function addCallSubscriber(recoveryId: string, ws: WSContext): void {
  let set = callSubscribers.get(recoveryId);
  if (!set) {
    set = new Set();
    callSubscribers.set(recoveryId, set);
  }
  set.add(ws);
}

export function removeCallSubscriber(
  recoveryId: string,
  ws: WSContext,
): void {
  const set = callSubscribers.get(recoveryId);
  if (!set) return;
  set.delete(ws);
  if (set.size === 0) callSubscribers.delete(recoveryId);
}

export function broadcastCallEvent(
  recoveryId: string,
  event: WsEvent,
): void {
  const set = callSubscribers.get(recoveryId);
  if (!set || set.size === 0) return;
  const msg = JSON.stringify(event);
  for (const ws of set) {
    try {
      ws.send(msg);
    } catch (err) {
      console.warn("[broadcast] send failed:", err);
    }
  }
}

export function addMerchantSubscriber(
  merchantId: string,
  ws: WSContext,
): void {
  let set = merchantSubscribers.get(merchantId);
  if (!set) {
    set = new Set();
    merchantSubscribers.set(merchantId, set);
  }
  set.add(ws);
}

export function removeMerchantSubscriber(
  merchantId: string,
  ws: WSContext,
): void {
  const set = merchantSubscribers.get(merchantId);
  if (!set) return;
  set.delete(ws);
  if (set.size === 0) merchantSubscribers.delete(merchantId);
}

export function broadcastMerchantEvent(
  merchantId: string,
  event: WsEvent,
): void {
  const set = merchantSubscribers.get(merchantId);
  if (!set || set.size === 0) return;
  const msg = JSON.stringify(event);
  for (const ws of set) {
    try {
      ws.send(msg);
    } catch (err) {
      console.warn("[broadcast] merchant send failed:", err);
    }
  }
}

/**
 * Fan out to both the per-recovery channel AND the owning merchant's channel.
 * Use this when the event is interesting to both the live-call viewer and the
 * recoveries list / analytics screens.
 */
export function broadcastRecoveryEvent(
  recoveryId: string,
  merchantId: string,
  event: WsEvent,
): void {
  broadcastCallEvent(recoveryId, event);
  broadcastMerchantEvent(merchantId, event);
}

export function sendSnapshot(ws: WSContext, snapshot: CallSnapshot): void {
  try {
    ws.send(JSON.stringify(snapshot));
  } catch (err) {
    console.warn("[broadcast] snapshot send failed:", err);
  }
}
