import type { PluginServerContext } from "@getpaseo/plugin/server";
import { readDisplayedProjectIcon } from "./server/icon";
import { projectIconRpc } from "./shared/icon-rpc";

export default function contribute(server: PluginServerContext) {
  server.handle(projectIconRpc, (input) => readDisplayedProjectIcon(input));
  return () => {};
}
