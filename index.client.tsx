import type { PluginClientContext } from "@getpaseo/plugin/client";
import { messages } from "./client/messages";
import { RecentProjects } from "./client/view";

export default function contribute(client: PluginClientContext) {
  return client.addSidebarView({
    id: "recent-projects",
    title: messages.message("viewTitle"),
    description: messages.message("viewDescription"),
    Component: RecentProjects,
  });
}
