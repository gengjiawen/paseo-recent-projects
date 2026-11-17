import { defineRpc } from "@getpaseo/plugin";
import { z } from "zod";

// The sidebar snapshot only carries an icon revision, not the bytes. The server reads the same
// icon the built-in sidebar would and returns it for this revision.
export const projectIconRpc = defineRpc({
  name: "project-icon",
  input: z.object({
    projectId: z.string(),
    rootPath: z.string(),
    iconRevision: z.string(),
  }),
  output: z
    .object({
      mimeType: z.string(),
      data: z.string(),
    })
    .nullable(),
});
