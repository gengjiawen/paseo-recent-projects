import { createHash } from "node:crypto";
import { readdir, readFile, stat } from "node:fs/promises";
import { extname, join, resolve } from "node:path";

// Search order, size cap, and square check follow the daemon's project icon reader
// (packages/server/src/utils/project-icon.ts) so this row shows the same image as the
// built-in sidebar. The first candidate wins; a later file is not a fallback.
const ICON_PATTERNS = [
  "favicon.svg",
  "favicon.png",
  "favicon-*.svg",
  "favicon-*.png",
  "favico.svg",
  "favico.png",
  "icon.svg",
  "icon.png",
  "app-icon.svg",
  "app-icon.png",
  "apple-touch-icon.png",
  "apple-touch-icon-*.png",
  "icon-*.png",
  "android-chrome-*.png",
  "safari-pinned-tab.svg",
  "mstile-*.png",
  "logo.svg",
  "logo.png",
  "favicon.ico",
  "favico.ico",
];

const PRIORITY_DIRS = ["public", "static", "priv/static", "assets", "images", "img"];
const MONOREPO_PACKAGE_DIRS = ["packages", "apps"];
const IGNORED_DIRS = new Set([
  ".git",
  "node_modules",
  "dist",
  "build",
  ".next",
  ".nuxt",
  ".output",
  "coverage",
  ".cache",
  "vendor",
  "src",
  "lib",
  "test",
  "tests",
  "__tests__",
]);

const AUTOMATIC_MAX_BYTES = 32 * 1024;
const CUSTOM_MAX_BYTES = 512 * 1024;
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

export interface DisplayedProjectIcon {
  mimeType: string;
  data: string;
}

interface IconRequest {
  projectId: string;
  rootPath: string;
  iconRevision: string;
}

interface ProjectRecord {
  projectId: string;
  rootPath: string;
  customIconRevision: string | null;
}

const cache = new Map<string, DisplayedProjectIcon | null>();

export async function readDisplayedProjectIcon(
  input: IconRequest,
  home = process.env.PASEO_HOME,
): Promise<DisplayedProjectIcon | null> {
  if (!home || input.projectId.length === 0 || input.projectId.includes("\0")) return null;
  const key = `${input.projectId}\0${input.iconRevision}`;
  const cached = cache.get(key);
  if (cached !== undefined) return cached;
  const icon = await loadIcon(input, home);
  cache.set(key, icon);
  return icon;
}

export function clearProjectIconCache(): void {
  cache.clear();
}

async function loadIcon(input: IconRequest, home: string): Promise<DisplayedProjectIcon | null> {
  const record = await findProject(home, input.projectId);
  if (!record || !samePath(record.rootPath, input.rootPath)) return null;
  if (record.customIconRevision) return readCustomIcon(home, record.projectId);
  if (input.iconRevision.startsWith("automatic:none") || input.iconRevision.startsWith("custom:none")) {
    return null;
  }
  return readAutomaticIcon(record.rootPath);
}

function samePath(left: string, right: string): boolean {
  return resolve(left).replace(/\/+$/, "") === resolve(right).replace(/\/+$/, "");
}

async function findProject(home: string, projectId: string): Promise<ProjectRecord | null> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(await readFile(join(home, "projects", "projects.json"), "utf8"));
  } catch {
    return null;
  }
  if (!Array.isArray(parsed)) return null;
  for (const entry of parsed) {
    if (!entry || typeof entry !== "object") continue;
    const record = entry as Record<string, unknown>;
    if (record.projectId !== projectId) continue;
    if (typeof record.rootPath !== "string") return null;
    return {
      projectId,
      rootPath: record.rootPath,
      customIconRevision: typeof record.customIconRevision === "string" ? record.customIconRevision : null,
    };
  }
  return null;
}

async function readCustomIcon(home: string, projectId: string): Promise<DisplayedProjectIcon | null> {
  const key = createHash("sha256").update(projectId).digest("hex");
  let bytes: Buffer;
  try {
    bytes = await readFile(join(home, "projects", "icons", `${key}.bin`));
  } catch {
    return null;
  }
  if (bytes.length === 0 || bytes.length > CUSTOM_MAX_BYTES) return null;
  return displayable(bytes, null);
}

async function readAutomaticIcon(rootPath: string): Promise<DisplayedProjectIcon | null> {
  const iconPath = await findProjectIcon(rootPath);
  if (!iconPath) return null;
  try {
    const info = await stat(iconPath);
    if (!info.isFile() || info.size > AUTOMATIC_MAX_BYTES) return null;
    return displayable(await readFile(iconPath), extname(iconPath));
  } catch {
    return null;
  }
}

function displayable(bytes: Buffer, extension: string | null): DisplayedProjectIcon | null {
  let mimeType = sniffMimeType(bytes) ?? (extension ? mimeFromExtension(extension) : null);
  let buffer = bytes;
  if (mimeType === "image/x-icon") {
    const frame = extractIcoPngFrame(bytes);
    if (!frame) return null;
    buffer = frame;
    mimeType = "image/png";
  }
  if (mimeType === "image/svg+xml") {
    const xml = normalizeSvg(buffer.toString("utf8"));
    if (!xml) return null;
    return { mimeType, data: Buffer.from(xml, "utf8").toString("base64") };
  }
  if (!mimeType || !isSquare(buffer, mimeType)) return null;
  return { mimeType, data: buffer.toString("base64") };
}

// The host draws an SVG only when the text starts at <svg. Favicons often carry an XML prolog
// and a DOCTYPE, which are not part of the image.
function normalizeSvg(xml: string): string | null {
  const document = xml
    .replace(/^\uFEFF/, "")
    .replace(/<\?xml[\s\S]*?\?>/gi, "")
    .replace(/<!DOCTYPE[\s\S]*?>/gi, "")
    .trim();
  return /^\s*<svg(?:\s|>)/i.test(document) ? document : null;
}

function sniffMimeType(buffer: Buffer): string | null {
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(PNG_SIGNATURE)) return "image/png";
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return "image/jpeg";
  if (buffer.length >= 6 && (buffer.toString("ascii", 0, 6) === "GIF87a" || buffer.toString("ascii", 0, 6) === "GIF89a")) {
    return "image/gif";
  }
  if (buffer.length >= 12 && buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP") {
    return "image/webp";
  }
  if (buffer.length >= 6 && buffer.readUInt16LE(0) === 0 && buffer.readUInt16LE(2) === 1 && buffer.readUInt16LE(4) > 0) {
    return "image/x-icon";
  }
  return null;
}

function mimeFromExtension(extension: string): string | null {
  switch (extension.toLowerCase()) {
    case ".png":
      return "image/png";
    case ".svg":
      return "image/svg+xml";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".gif":
      return "image/gif";
    case ".webp":
      return "image/webp";
    case ".ico":
      return "image/x-icon";
    default:
      return null;
  }
}

function isSquare(buffer: Buffer, mimeType: string): boolean {
  if (mimeType === "image/svg+xml") return true;
  const size = dimensions(buffer, mimeType);
  return size !== null && size.width > 0 && size.width === size.height && size.width <= 1024;
}

function dimensions(buffer: Buffer, mimeType: string): { width: number; height: number } | null {
  if (mimeType === "image/png") {
    if (buffer.length < 24 || !buffer.subarray(0, 8).equals(PNG_SIGNATURE)) return null;
    return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
  }
  if (mimeType === "image/gif") {
    if (buffer.length < 10 || buffer.toString("ascii", 0, 3) !== "GIF") return null;
    return { width: buffer.readUInt16LE(6), height: buffer.readUInt16LE(8) };
  }
  if (mimeType === "image/jpeg") return jpegDimensions(buffer);
  if (mimeType === "image/webp") return webpDimensions(buffer);
  return null;
}

function jpegDimensions(buffer: Buffer): { width: number; height: number } | null {
  if (buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8) return null;
  let offset = 2;
  while (offset < buffer.length - 8) {
    if (buffer[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = buffer[offset + 1] ?? 0;
    if (marker >= 0xc0 && marker <= 0xc2) {
      return { height: buffer.readUInt16BE(offset + 5), width: buffer.readUInt16BE(offset + 7) };
    }
    const length = buffer.readUInt16BE(offset + 2);
    offset += 2 + length;
  }
  return null;
}

function webpDimensions(buffer: Buffer): { width: number; height: number } | null {
  if (buffer.length < 30) return null;
  if (buffer.toString("ascii", 0, 4) !== "RIFF" || buffer.toString("ascii", 8, 12) !== "WEBP") return null;
  const chunk = buffer.toString("ascii", 12, 16);
  if (chunk === "VP8 ") {
    return { width: buffer.readUInt16LE(26) & 0x3fff, height: buffer.readUInt16LE(28) & 0x3fff };
  }
  if (chunk === "VP8L") {
    const bits = buffer.readUInt32LE(21);
    return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
  }
  return null;
}

function extractIcoPngFrame(buffer: Buffer): Buffer | null {
  if (buffer.length < 6 || buffer.readUInt16LE(0) !== 0 || buffer.readUInt16LE(2) !== 1) return null;
  const frameCount = buffer.readUInt16LE(4);
  let best: Buffer | null = null;
  let bestWidth = -1;
  for (let index = 0; index < frameCount; index += 1) {
    const entry = 6 + index * 16;
    if (entry + 16 > buffer.length) break;
    const width = buffer[entry] === 0 ? 256 : (buffer[entry] ?? 0);
    const dataSize = buffer.readUInt32LE(entry + 8);
    const dataOffset = buffer.readUInt32LE(entry + 12);
    if (dataOffset + dataSize > buffer.length) continue;
    const frame = buffer.subarray(dataOffset, dataOffset + dataSize);
    if (frame.length >= 8 && frame.subarray(0, 8).equals(PNG_SIGNATURE) && width > bestWidth) {
      best = Buffer.from(frame);
      bestWidth = width;
    }
  }
  return best;
}

async function findProjectIcon(root: string): Promise<string | null> {
  const fromPriority = await searchPriorityDirs(root, 2);
  if (fromPriority) return fromPriority;
  for (const mono of MONOREPO_PACKAGE_DIRS) {
    let packages: string[];
    try {
      packages = await readdir(join(root, mono));
    } catch {
      continue;
    }
    for (const name of packages) {
      const packageRoot = join(root, mono, name);
      if (!(await isDirectory(packageRoot))) continue;
      const nested = await searchPriorityDirs(packageRoot, 2);
      if (nested) return nested;
      const direct = await findIconInDir(packageRoot);
      if (direct) return direct;
    }
  }
  return findIconInDir(root);
}

async function searchPriorityDirs(base: string, maxDepth: number): Promise<string | null> {
  for (const dir of PRIORITY_DIRS) {
    const path = join(base, dir);
    if (!(await isDirectory(path))) continue;
    const found = await searchDir(path, maxDepth, 0);
    if (found) return found;
  }
  return null;
}

async function searchDir(dir: string, maxDepth: number, depth: number): Promise<string | null> {
  if (depth > maxDepth) return null;
  const found = await findIconInDir(dir);
  if (found) return found;
  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch {
    return null;
  }
  for (const entry of entries) {
    if (IGNORED_DIRS.has(entry)) continue;
    const path = join(dir, entry);
    if (!(await isDirectory(path))) continue;
    const nested = await searchDir(path, maxDepth, depth + 1);
    if (nested) return nested;
  }
  return null;
}

async function findIconInDir(dir: string): Promise<string | null> {
  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch {
    return null;
  }
  for (const pattern of ICON_PATTERNS) {
    for (const entry of entries) {
      if (!matches(entry, pattern)) continue;
      const path = join(dir, entry);
      if (await isFile(path)) return path;
    }
  }
  return null;
}

function matches(filename: string, pattern: string): boolean {
  if (!pattern.includes("*")) return filename === pattern;
  const expression = pattern.replace(/\./g, "\\.").replace(/\*/g, ".*");
  return new RegExp(`^${expression}$`).test(filename);
}

async function isDirectory(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isDirectory();
  } catch {
    return false;
  }
}

async function isFile(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isFile();
  } catch {
    return false;
  }
}
