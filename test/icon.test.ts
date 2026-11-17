import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { deflateSync, crc32 } from "node:zlib";
import { clearProjectIconCache, readDisplayedProjectIcon } from "../server/icon.ts";

function png(width: number, height: number): Buffer {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const row = Buffer.alloc(1 + width * 3, 0);
  const raw = Buffer.concat(Array.from({ length: height }, () => row));
  return Buffer.concat([
    signature,
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function chunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body) >>> 0);
  return Buffer.concat([length, body, crc]);
}

async function fixture(): Promise<{ home: string; root: string; projectId: string }> {
  const home = await mkdtemp(join(tmpdir(), "recent-projects-icon-"));
  const root = await mkdtemp(join(tmpdir(), "recent-projects-repo-"));
  const projectId = "prj_icon";
  await mkdir(join(home, "projects", "icons"), { recursive: true });
  await writeFile(
    join(home, "projects", "projects.json"),
    JSON.stringify([{ projectId, rootPath: root, customIconRevision: null }]),
  );
  return { home, root, projectId };
}

test("skips projects with no image and projects that are not on this daemon", async () => {
  const { home, root, projectId } = await fixture();
  try {
    await writeFile(join(root, "favicon.png"), png(1, 1));
    assert.equal(
      await readDisplayedProjectIcon(
        { projectId, rootPath: root, iconRevision: "automatic:none:v1" },
        home,
      ),
      null,
    );
    assert.equal(
      await readDisplayedProjectIcon(
        { projectId: "missing", rootPath: root, iconRevision: "automatic:abc" },
        home,
      ),
      null,
    );
    const remoteId = "remote:github.com/example/app";
    const projects = JSON.parse(await readFile(join(home, "projects", "projects.json"), "utf8")) as {
      projectId: string;
    }[];
    projects[0].projectId = remoteId;
    await writeFile(join(home, "projects", "projects.json"), JSON.stringify(projects));
    clearProjectIconCache();
    const remote = await readDisplayedProjectIcon(
      { projectId: remoteId, rootPath: root, iconRevision: "automatic:abc" },
      home,
    );
    assert.equal(remote?.mimeType, "image/png");
    assert.equal(
      await readDisplayedProjectIcon(
        { projectId, rootPath: "/somewhere/else", iconRevision: "automatic:abc" },
        home,
      ),
      null,
    );
  } finally {
    clearProjectIconCache();
    await rm(home, { recursive: true, force: true });
    await rm(root, { recursive: true, force: true });
  }
});

test("reads the automatic favicon and the uploaded icon", async () => {
  const { home, root, projectId } = await fixture();
  try {
    await mkdir(join(root, "public"));
    await writeFile(join(root, "favicon.png"), png(2, 1));
    await writeFile(
      join(root, "public", "favicon.svg"),
      "<?xml version=\"1.0\"?>\n<!DOCTYPE svg>\n<svg xmlns='http://www.w3.org/2000/svg'/>",
    );
    const automatic = await readDisplayedProjectIcon(
      { projectId, rootPath: root, iconRevision: "automatic:hash" },
      home,
    );
    assert.equal(automatic?.mimeType, "image/svg+xml");
    const svg = Buffer.from(automatic?.data ?? "", "base64").toString("utf8");
    assert.equal(svg.startsWith("<svg"), true);
    assert.equal(svg.includes("DOCTYPE"), false);

    const uploaded = png(8, 8);
    const hash = createHash("sha256").update(projectId).digest("hex");
    await writeFile(join(home, "projects", "icons", `${hash}.bin`), uploaded);
    const projects = JSON.parse(await readFile(join(home, "projects", "projects.json"), "utf8")) as {
      customIconRevision: string | null;
    }[];
    projects[0].customIconRevision = "rev-1";
    await writeFile(join(home, "projects", "projects.json"), JSON.stringify(projects));
    clearProjectIconCache();
    const custom = await readDisplayedProjectIcon(
      { projectId, rootPath: root, iconRevision: "rev-1" },
      home,
    );
    assert.equal(custom?.mimeType, "image/png");
    assert.equal(custom?.data, uploaded.toString("base64"));
  } finally {
    clearProjectIconCache();
    await rm(home, { recursive: true, force: true });
    await rm(root, { recursive: true, force: true });
  }
});

test("drops an automatic image that is not square", async () => {
  const { home, root, projectId } = await fixture();
  try {
    await writeFile(join(root, "favicon.png"), png(2, 1));
    assert.equal(
      await readDisplayedProjectIcon(
        { projectId, rootPath: root, iconRevision: "automatic:wide" },
        home,
      ),
      null,
    );
  } finally {
    clearProjectIconCache();
    await rm(home, { recursive: true, force: true });
    await rm(root, { recursive: true, force: true });
  }
});
