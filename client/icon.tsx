import { useEffect, useState } from "react";
import { Image } from "react-native";
import { findSvgIconProblem, type PluginProjectSnapshot } from "@getpaseo/plugin";
import { useRpc, type PluginSidebarViewProps } from "@getpaseo/plugin/client";
import { Icon } from "@getpaseo/plugin/client/react-native";
import { projectIconRpc } from "../shared/icon-rpc";

type Icon = { mimeType: string; data: string };

const cache = new Map<string, Icon | null>();

function hasImage(revision: string | null): revision is string {
  return revision !== null && !revision.startsWith("automatic:none") && !revision.startsWith("custom:none");
}

export function useProjectIcon(project: PluginProjectSnapshot | null): Icon | null {
  const readIcon = useRpc(projectIconRpc);
  const projectId = project?.ref.id ?? null;
  const rootPath = project?.rootPath ?? null;
  const revision = project?.iconRevision ?? null;
  const key = projectId && revision ? `${projectId}\0${revision}` : null;
  const [icon, setIcon] = useState<Icon | null>(key ? (cache.get(key) ?? null) : null);

  useEffect(() => {
    if (!projectId || !rootPath || !key || !hasImage(revision)) {
      setIcon(null);
      return;
    }
    const cached = cache.get(key);
    if (cached !== undefined) {
      setIcon(cached);
      return;
    }
    let active = true;
    readIcon({ projectId, rootPath, iconRevision: revision }).then(
      (result) => {
        cache.set(key, result);
        if (active) setIcon(result);
      },
      () => {
        if (active) setIcon(null);
      },
    );
    return () => {
      active = false;
    };
  }, [key, projectId, readIcon, revision, rootPath]);

  return icon;
}

const BASE64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

function decodeBase64(data: string): string {
  const clean = data.replace(/=+$/, "");
  const bytes: number[] = [];
  for (let index = 0; index < clean.length; index += 4) {
    const group =
      (BASE64.indexOf(clean[index] ?? "A") << 18) |
      (BASE64.indexOf(clean[index + 1] ?? "A") << 12) |
      (BASE64.indexOf(clean[index + 2] ?? "A") << 6) |
      BASE64.indexOf(clean[index + 3] ?? "A");
    bytes.push((group >> 16) & 255);
    if (index + 2 < clean.length) bytes.push((group >> 8) & 255);
    if (index + 3 < clean.length) bytes.push(group & 255);
  }
  return new TextDecoder().decode(Uint8Array.from(bytes));
}

// Uploaded marks are not clipped. A square logo stays square; a round one is already round.
// SVG goes through the host icon renderer, which draws on web and on the phone. A raster image
// uses the platform image view.
export function ProjectMark({
  icon,
  view,
}: {
  icon: Icon;
  view: PluginSidebarViewProps;
}) {
  const [failed, setFailed] = useState(false);
  const size = view.layout.compact ? 20 : 16;
  if (icon.mimeType === "image/svg+xml") {
    const xml = decodeBase64(icon.data);
    if (findSvgIconProblem(xml) === null) {
      return <Icon icon={{ svg: xml }} size={size} color={view.theme.colors.foreground} />;
    }
  }
  if (failed) return null;
  return (
    <Image
      accessible={false}
      accessibilityIgnoresInvertColors
      onError={() => setFailed(true)}
      source={{ uri: `data:${icon.mimeType};base64,${icon.data}` }}
      style={{ width: size, height: size }}
    />
  );
}
