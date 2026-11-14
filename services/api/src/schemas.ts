import { z } from "zod";

const baseUnits = z.string().regex(/^[1-9][0-9]{0,77}$/, "Use a positive integer amount in native base units");
const wallet = z.string().regex(/^0x[0-9a-fA-F]{40}$/);
const stringList = z.array(z.string().trim().min(1).max(80)).max(30);

export const roleSchema = z.object({ role: z.enum(["requester", "earner"]) });
export const bountySchema = z.object({
  title: z.string().trim().min(5).max(160),
  description: z.string().trim().min(20).max(12000),
  category: z.string().trim().min(1).max(80),
  requiredSkills: stringList,
  deliverableRequirements: z.string().trim().max(8000),
  maxBudgetBaseUnits: baseUnits,
  displayFiatAmount: z.string().regex(/^\d+(\.\d{1,2})?$/).optional(),
  displayFiatCurrency: z.string().regex(/^[A-Z]{3}$/).optional(),
  deadline: z.string().datetime().refine((value) => new Date(value).getTime() > Date.now(), "Deadline must be in the future"),
}).refine((value) => Boolean(value.displayFiatAmount) === Boolean(value.displayFiatCurrency), {
  message: "Provide both display fiat amount and currency or neither",
});
export const agentSchema = z.object({
  name: z.string().trim().min(1).max(100),
  description: z.string().trim().max(4000),
  skills: stringList,
  categories: stringList,
  capabilities: stringList,
  minRewardBaseUnits: z.string().regex(/^(0|[1-9][0-9]{0,77})$/),
  payoutWallet: wallet.optional(),
  available: z.boolean().default(true),
});
export const submissionSchema = z.object({
  bountyId: z.string().uuid(),
  agentId: z.string().uuid(),
  proposedAmountBaseUnits: baseUnits,
  deliverableType: z.enum(["file", "repository", "video", "external_link", "text"]),
  deliverableUrl: z.string().url().max(2000).optional(),
  description: z.string().max(8000).default(""),
}).refine((value) => Boolean(value.deliverableUrl || value.deliverableType === "text"), {
  message: "A link, stored file, or text deliverable is required",
});
export const usdTdnAmount = z.string().regex(/^(0|[1-9][0-9]{0,14})(\.[0-9]{1,3})?$/, "Use a decimal string with up to three decimal places");
const optionalText = (max: number) => z.string().trim().min(1).max(max).nullable().optional().transform((value) => value ?? null);
export const qatomReceiptSchema = z.object({
  idempotencyKey: z.string().trim().min(1).max(400),
  bountyId: z.string().uuid(),
  agentId: z.string().uuid(),
  status: z.enum(["completed", "pending_approval", "rejected"]),
  transactionId: optionalText(200),
  itemId: z.string().trim().min(1).max(200),
  itemName: z.string().trim().max(300),
  seller: z.string().trim().min(1).max(200),
  amountUsdTdn: usdTdnAmount,
  approvalUrl: z.string().url().max(2000).startsWith("https://").nullable().optional().transform((value) => value ?? null),
  rejectionReason: optionalText(1000),
  receipt: z.record(z.string(), z.unknown()).default({}).refine((value) => JSON.stringify(value).length <= 16_000, "Receipt is too large"),
  occurredAt: z.string().datetime({ offset: true }),
}).refine((value) => value.idempotencyKey.length > `${value.bountyId}:${value.agentId}:${value.itemId}:`.length && value.idempotencyKey.startsWith(`${value.bountyId}:${value.agentId}:${value.itemId}:`), {
  message: "idempotencyKey must be bountyId:agentId:itemId:stepId", path: ["idempotencyKey"],
}).refine((value) => value.status !== "completed" || Boolean(value.transactionId), { message: "Completed purchases require a transactionId", path: ["transactionId"] })
  .refine((value) => value.status !== "pending_approval" || Boolean(value.approvalUrl), { message: "Pending approvals require an approvalUrl", path: ["approvalUrl"] })
  .refine((value) => value.status !== "rejected" || Boolean(value.rejectionReason), { message: "Rejected purchases require a rejectionReason", path: ["rejectionReason"] });
export type QatomReceiptInput = z.infer<typeof qatomReceiptSchema>;
