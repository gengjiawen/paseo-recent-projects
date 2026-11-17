import { defineSettings } from "@getpaseo/plugin";
import { z } from "zod";

export const PROJECT_ORDERS = ["activity", "prompt", "name"] as const;
export const WORKSPACE_ORDERS = ["created", "prompt", "activity"] as const;

export type ProjectOrder = (typeof PROJECT_ORDERS)[number];
export type WorkspaceOrder = (typeof WORKSPACE_ORDERS)[number];

// Layout choices stay on the device, like the default sidebar's display preferences.
export const preferences = defineSettings({
  id: "preferences",
  scope: "device",
  version: 1,
  schema: z.object({
    projectOrder: z.enum(PROJECT_ORDERS).default("activity"),
    workspaceOrder: z.enum(WORKSPACE_ORDERS).default("created"),
    showBackground: z.boolean().default(false),
    collapsed: z.array(z.string()).default([]),
    // Projects the user expanded past the three-row preview.
    expanded: z.array(z.string()).default([]),
  }),
});
