// Per CLAUDE.md §8. Single source of truth on the backend; mobile copies
// (cannot live in a shared package — there's no monorepo).

export type WsEvent =
  | {
      type: "recovery.queued";
      data: { recoveryId: string; failedInvoiceId: string };
    }
  | { type: "recovery.scheduled"; data: { recoveryId: string; at: number } }
  | {
      type: "call.initiated";
      data: { recoveryId: string; conversationId: string };
    }
  | {
      type: "call.failed_to_connect";
      data: { recoveryId: string; reason: "busy" | "no-answer" | "unknown" };
    }
  | { type: "call.connected"; data: { recoveryId: string } }
  | {
      type: "tool.fired";
      data: {
        recoveryId: string;
        tool: string;
        args: Record<string, unknown>;
        ts: number;
      };
    }
  | {
      type: "call.ended";
      data: {
        recoveryId: string;
        durationSecs: number;
        summary: string;
        outcome: string;
      };
    }
  | {
      type: "recovery.recovered";
      data: {
        recoveryId: string;
        amount: number;
        fee: number;
        currency: string;
      };
    }
  | { type: "recovery.failed"; data: { recoveryId: string; reason: string } };

export type CallSnapshot = {
  type: "snapshot";
  data: {
    recovery: {
      id: string;
      state: string;
      attempts: number;
      scheduledFor: string | null;
    };
    failedInvoice: {
      customerName: string | null;
      customerPhone: string | null;
      planName: string | null;
      amountDue: number;
      currency: string;
    };
    merchant: { name: string };
    latestCallAttempt: {
      id: string;
      initiatedAt: string;
      endedAt: string | null;
      durationSecs: number | null;
      outcome: string | null;
      toolCallsFired: Array<{
        name: string;
        args: Record<string, unknown>;
        timestamp: number;
      }>;
    } | null;
  };
};

export type WsMessage = CallSnapshot | WsEvent;
