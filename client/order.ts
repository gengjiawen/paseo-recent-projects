import type { PluginWorkspaceSnapshot } from "@getpaseo/plugin";
import type { ProjectOrder, WorkspaceOrder } from "../shared/preferences";

type Timed = Pick<
  PluginWorkspaceSnapshot,
  "statusEnteredAt" | "lastPromptAt" | "createdAt" | "projectDisplayName" | "name" | "title"
>;

function time(value: string | null): number | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function latest(...values: (string | null)[]): number | null {
  let result: number | null = null;
  for (const value of values) {
    const parsed = time(value);
    if (parsed !== null && (result === null || parsed > result)) result = parsed;
  }
  return result;
}

// The newest thing that happened in a workspace. `statusEnteredAt` is what #4140 sorts by; the
// prompt and creation times cover a workspace whose status never changed.
export function activityTime(workspace: Timed): number | null {
  return latest(workspace.statusEnteredAt, workspace.lastPromptAt, workspace.createdAt);
}

// Human-prompt recency, the upstream "Last prompt" sort: a prompt, else creation.
export function promptTime(workspace: Timed): number | null {
  return time(workspace.lastPromptAt) ?? time(workspace.createdAt);
}

function byTimeDesc(a: number | null, b: number | null): number {
  if (a === b) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return b - a;
}

const collator = new Intl.Collator(undefined, { sensitivity: "base", numeric: true });

function label(workspace: Timed): string {
  return workspace.title ?? workspace.name;
}

/**
 * Orders workspaces so that grouping them by project yields the project order: groups follow
 * first appearance, so a project lands where its newest workspace does. Undated workspaces sort
 * after dated ones, by project name, so their projects keep a stable alphabetical tail.
 */
export function compareForProjectOrder(order: ProjectOrder) {
  return (a: Timed, b: Timed): number => {
    if (order !== "name") {
      const read = order === "activity" ? activityTime : promptTime;
      const byTime = byTimeDesc(read(a), read(b));
      if (byTime !== 0) return byTime;
    }
    return collator.compare(a.projectDisplayName, b.projectDisplayName);
  };
}

/** Orders the rows inside one project section. Newest first; ties fall back to the row label. */
export function compareWorkspaces(order: WorkspaceOrder) {
  const read =
    order === "created"
      ? (workspace: Timed) => time(workspace.createdAt)
      : order === "prompt"
        ? promptTime
        : activityTime;
  return (a: Timed, b: Timed): number =>
    byTimeDesc(read(a), read(b)) || collator.compare(label(a), label(b));
}
