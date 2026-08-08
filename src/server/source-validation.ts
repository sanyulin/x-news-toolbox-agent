import { z } from "zod";

import { isPublicHttpsUrl } from "@/server/network-address";

export const sourceTypeSchema = z.enum(["rss", "atom", "json", "rsshub", "x-account"]);

export const sourceInputSchema = z.object({
  type: sourceTypeSchema,
  name: z.string().trim().min(1).max(80),
  locator: z.string().trim().min(1).max(2000),
  enabled: z.boolean().default(true),
  mapping: z.record(z.string(), z.string()).optional(),
}).superRefine((value, context) => {
  if (value.type === "x-account") {
    if (!/^@?[A-Za-z0-9_]{1,15}$/.test(value.locator)) {
      context.addIssue({ code: "custom", path: ["locator"], message: "X 账号格式无效" });
    }
  } else if (!isPublicHttpsUrl(value.locator)) {
    context.addIssue({ code: "custom", path: ["locator"], message: "来源必须是公网 HTTPS 地址" });
  }
});
