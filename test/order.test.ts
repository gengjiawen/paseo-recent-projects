import assert from "node:assert/strict";
import { test } from "node:test";
import { compareForProjectOrder, compareWorkspaces } from "../client/order.ts";

interface Row {
  id: string;
  projectDisplayName: string;
  name: string;
  title: string | null;
  statusEnteredAt: string | null;
  lastPromptAt: string | null;
  createdAt: string | null;
}

function row(id: string, project: string, times: Partial<Row> = {}): Row {
  return {
    id,
    projectDisplayName: project,
    name: id,
    title: null,
    statusEnteredAt: null,
    lastPromptAt: null,
    createdAt: null,
    ...times,
  };
}

// Mirrors the host's groupBy: groups follow first appearance after sorting.
function projectOrder(rows: Row[], compare: (a: Row, b: Row) => number): string[] {
  const seen: string[] = [];
  for (const item of [...rows].sort(compare)) {
    if (!seen.includes(item.projectDisplayName)) seen.push(item.projectDisplayName);
  }
  return seen;
}

test("activity puts the project with the newest workspace first", () => {
  const rows = [
    row("a1", "api", { statusEnteredAt: "2026-11-01T10:00:00Z" }),
    row("a2", "api", { statusEnteredAt: "2026-11-01T08:00:00Z" }),
    row("b1", "billing", { statusEnteredAt: "2026-11-01T09:00:00Z" }),
  ];
  assert.deepEqual(projectOrder(rows, compareForProjectOrder("activity")), ["api", "billing"]);
  rows[2].statusEnteredAt = "2026-11-01T11:00:00Z";
  assert.deepEqual(projectOrder(rows, compareForProjectOrder("activity")), ["billing", "api"]);
});

test("activity counts a prompt or creation newer than the last status change", () => {
  const rows = [
    row("a1", "api", { statusEnteredAt: "2026-11-01T10:00:00Z" }),
    row("b1", "billing", {
      statusEnteredAt: "2026-11-01T09:00:00Z",
      lastPromptAt: "2026-11-01T12:00:00Z",
    }),
    row("c1", "cli", { createdAt: "2026-11-01T13:00:00Z" }),
  ];
  assert.deepEqual(projectOrder(rows, compareForProjectOrder("activity")), [
    "cli",
    "billing",
    "api",
  ]);
});

test("prompt ignores status changes, so a finished agent does not move its project", () => {
  const rows = [
    row("a1", "api", { lastPromptAt: "2026-11-01T10:00:00Z", statusEnteredAt: "2026-11-01T10:05:00Z" }),
    row("b1", "billing", {
      lastPromptAt: "2026-11-01T09:00:00Z",
      statusEnteredAt: "2026-11-01T23:00:00Z",
    }),
  ];
  assert.deepEqual(projectOrder(rows, compareForProjectOrder("prompt")), ["api", "billing"]);
  assert.deepEqual(projectOrder(rows, compareForProjectOrder("activity")), ["billing", "api"]);
});

test("undated projects follow dated ones alphabetically", () => {
  const rows = [
    row("z1", "zeta"),
    row("a1", "alpha"),
    row("m1", "mid", { statusEnteredAt: "2026-11-01T10:00:00Z" }),
  ];
  assert.deepEqual(projectOrder(rows, compareForProjectOrder("activity")), ["mid", "alpha", "zeta"]);
  assert.deepEqual(projectOrder(rows, compareForProjectOrder("name")), ["alpha", "mid", "zeta"]);
});

test("workspaces inside a project sort newest first by the chosen time", () => {
  const rows = [
    row("old", "api", { createdAt: "2026-10-01T00:00:00Z", lastPromptAt: "2026-11-02T00:00:00Z" }),
    row("new", "api", { createdAt: "2026-10-05T00:00:00Z" }),
    row("none", "api"),
  ];
  const ids = (compare: (a: Row, b: Row) => number) => [...rows].sort(compare).map((r) => r.id);
  assert.deepEqual(ids(compareWorkspaces("created")), ["new", "old", "none"]);
  assert.deepEqual(ids(compareWorkspaces("prompt")), ["old", "new", "none"]);
});
