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
