import type { QatomReceiptEvent } from "./types.js";

export type ReceiptReporterConfig = {
  apiUrl: string;
  internalWorkerToken: string;
  fetch?: typeof fetch;
};

/** Builds the guard's onReceipt callback that posts to POST /internal/qatom/receipts. */
export function createReceiptReporter(config: ReceiptReporterConfig) {
  if (!config.apiUrl || !config.internalWorkerToken) throw new Error("Set BOUNTIQ_API_URL and INTERNAL_WORKER_TOKEN to report Qatom receipts");
  const send = config.fetch ?? fetch;
  const url = new URL("/internal/qatom/receipts", config.apiUrl);
  return async (event: QatomReceiptEvent): Promise<void> => {
    const response = await send(url, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${config.internalWorkerToken}` },
      body: JSON.stringify(event),
    });
    if (response.status === 200 || response.status === 201) return;
    const body = await response.json().catch(() => ({})) as { error?: string };
    throw new Error(`Bountiq rejected Qatom receipt ${event.idempotencyKey} (${response.status}): ${body.error ?? "no details"}`);
  };
}
