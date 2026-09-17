import { z } from "zod";

export const gmvEventInputSchema = z.object({
  projectId: z.string().trim().min(1).max(120),
  sellerId: z.string().trim().min(1).max(120),
  merchantName: z.string().trim().min(1).max(200),
  eventType: z.enum(["PAYMENT_CAPTURED", "REFUND_COMPLETED"]),
  amount: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  currency: z.enum(["JPY", "CNY"]),
  occurredAt: z.string().datetime(),
  orderId: z.string().trim().min(1).max(200),
  providerEventId: z.string().trim().min(1).max(240),
  sourceSystem: z.string().trim().min(1).max(120),
});

export type GmvEventInput = z.infer<typeof gmvEventInputSchema>;
