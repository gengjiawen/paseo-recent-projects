import { useCallback, useMemo, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import {
  useHosts,
  useProjects,
  useSettings,
  useTranslation,
  useWorkspaces,
  type PluginSidebarViewProps,
  type ProjectRef,
  type WorkspaceRef,
} from "@getpaseo/plugin/client";
import { Icon } from "@getpaseo/plugin/client/react-native";
import type { PluginWorkspaceSnapshot } from "@getpaseo/plugin";
import { preferences } from "../shared/preferences";
import { WorkspaceActions } from "./actions";
import { messages } from "./messages";
import { OptionsModal, PROJECT_ORDER_LABEL, type Preferences } from "./options";
import { compareForProjectOrder, compareWorkspaces } from "./order";
import { density, ProjectHeader, RAIL, ShowMoreRow, WorkspaceRow } from "./rows";

// Same visibility rules as the default sidebar: rows being archived are gone, and background
// workspaces only show when asked for.
function isVisible(workspace: PluginWorkspaceSnapshot, showBackground: boolean): boolean {
  return workspace.archivingAt === null && (showBackground || !workspace.background);
}

const NESTED_INDENT = 22;
// Long projects show their first few workspaces; the rest stay one click away.
const PREVIEW_ROWS = 3;

function ProjectSection({
  reference,
  view,
  values,
  hostLabel,
  onToggle,
  onToggleExpanded,
  onActions,
}: {
  reference: ProjectRef;
  view: PluginSidebarViewProps;
  values: Preferences;
  hostLabel: string | null;
  onToggle(key: string): void;
  onToggleExpanded(key: string): void;
  onActions(reference: WorkspaceRef): void;
}) {
  const { t } = useTranslation(messages);
  const workspaces = useWorkspaces({
    where: (item) =>
      item.project.key === reference.key && !item.pinnedAt && isVisible(item, values.showBackground),
    orderBy: compareWorkspaces(values.workspaceOrder),
  });
  const collapsed = values.collapsed.includes(reference.key);
  const expanded = values.expanded.includes(reference.key);
  const shown = expanded ? workspaces : workspaces.slice(0, PREVIEW_ROWS);
  const hidden = workspaces.length - shown.length;
  const more = useCallback(() => onToggleExpanded(reference.key), [onToggleExpanded, reference.key]);
  return (
    <View>
      <ProjectHeader
        reference={reference}
        view={view}
        collapsed={collapsed}
        hiddenCount={workspaces.length}
        hostLabel={hostLabel}
        onToggle={onToggle}
      />
      {collapsed ? null : (
        <>
          {shown.map((workspace) => (
            <WorkspaceRow
              key={workspace.key}
              reference={workspace}
              view={view}
              indent={NESTED_INDENT}
              onActions={onActions}
            />
          ))}
          {hidden > 0 || (expanded && workspaces.length > PREVIEW_ROWS) ? (
            <ShowMoreRow
              view={view}
              indent={NESTED_INDENT}
              label={hidden > 0 ? t("showMore", { count: hidden }) : t("showLess")}
              onPress={more}
              testID={`recent-projects-more-${reference.key}`}
            />
          ) : null}
        </>
      )}
    </View>
  );
}

function Sidebar({
  view,
  values,
  save,
}: {
  view: PluginSidebarViewProps;
  values: Preferences;
  save(next: Preferences): void;
}) {
  const { t } = useTranslation(messages);
  const { theme } = view;
  const size = density(view);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [actionsFor, setActionsFor] = useState<WorkspaceRef | null>(null);
  const hosts = useHosts();

  const pinned = useWorkspaces({
    where: (item) => item.pinnedAt !== null && isVisible(item, values.showBackground),
    orderBy: ["pinnedAt", "asc"],
  });
  // Grouping sorted workspaces by project orders the projects by their newest workspace, because
  // groups follow first appearance. Pinned rows still count toward their project's recency.
  const orderedGroups = useWorkspaces({
    where: (item) => isVisible(item, values.showBackground),
    orderBy: compareForProjectOrder(values.projectOrder),
    groupBy: (item) => item.project.key,
  });
  const projects = useProjects({ orderBy: "displayName" });

  const orderedProjects = useMemo(() => {
    const byKey = new Map(projects.map((project) => [project.key, project]));
    const ordered: ProjectRef[] = [];
    for (const group of orderedGroups) {
      const project = byKey.get(group.key);
      if (!project) continue;
      ordered.push(project);
      byKey.delete(group.key);
    }
    // Projects without visible workspaces keep their alphabetical order at the end.
    for (const project of byKey.values()) ordered.push(project);
    return ordered;
  }, [orderedGroups, projects]);

  const hostLabels = useMemo(
    () => (hosts.length > 1 ? new Map(hosts.map((host) => [host.serverId, host.label])) : null),
    [hosts],
  );
  const toggle = useCallback(
    (key: string) =>
      save({
        ...values,
        collapsed: values.collapsed.includes(key)
          ? values.collapsed.filter((item) => item !== key)
          : [...values.collapsed, key],
      }),
    [save, values],
  );
  const toggleExpanded = useCallback(
    (key: string) =>
      save({
        ...values,
        expanded: values.expanded.includes(key)
          ? values.expanded.filter((item) => item !== key)
          : [...values.expanded, key],
      }),
    [save, values],
  );
  const closeActions = useCallback(() => setActionsFor(null), []);
  const closeOptions = useCallback(() => setOptionsOpen(false), []);
  const openOptions = useCallback(() => setOptionsOpen(true), []);

  return (
    <View style={{ flex: 1 }}>
      <Pressable
        testID="recent-projects-options"
        accessibilityRole="button"
        accessibilityLabel={t("options")}
        onPress={openOptions}
        style={({ pressed }) => ({
          flexDirection: "row",
          alignItems: "center",
          gap: 6,
          minHeight: view.layout.compact ? 36 : 24,
          paddingHorizontal: RAIL,
          backgroundColor: pressed ? theme.colors.surface1 : undefined,
        })}
      >
        <Icon name="ArrowDownWideNarrow" size={12} color={theme.colors.foregroundMuted} />
        <Text style={{ color: theme.colors.foregroundMuted, fontSize: size.secondary }}>
          {t("openOptions", { order: t(PROJECT_ORDER_LABEL[values.projectOrder]) })}
        </Text>
      </Pressable>
      <ScrollView contentContainerStyle={{ paddingBottom: 12 }}>
        {pinned.length > 0 ? (
          <View>
            <Text
              accessibilityRole="header"
              style={{
                color: theme.colors.foregroundMuted,
                fontSize: size.secondary,
                paddingHorizontal: RAIL,
                paddingTop: 8,
                paddingBottom: 2,
              }}
            >
              {t("pinned")}
            </Text>
            {pinned.map((workspace) => (
              <WorkspaceRow
                key={workspace.key}
                reference={workspace}
                view={view}
                indent={0}
                showProject
                onActions={setActionsFor}
              />
            ))}
          </View>
        ) : null}
        {orderedProjects.map((project) => (
          <ProjectSection
            key={project.key}
            reference={project}
            view={view}
            values={values}
            hostLabel={hostLabels?.get(project.hostId) ?? null}
            onToggle={toggle}
            onToggleExpanded={toggleExpanded}
            onActions={setActionsFor}
          />
        ))}
        {orderedProjects.length === 0 ? (
          <Text style={{ color: theme.colors.foregroundMuted, fontSize: 12, padding: RAIL }}>
            {t("empty")}
          </Text>
        ) : null}
      </ScrollView>
      {optionsOpen ? (
        <OptionsModal values={values} theme={theme} onChange={save} onClose={closeOptions} />
      ) : null}
      {actionsFor ? (
        <WorkspaceActions reference={actionsFor} theme={theme} onClose={closeActions} />
      ) : null}
    </View>
  );
}

export function RecentProjects(view: PluginSidebarViewProps) {
  const { t } = useTranslation(messages);
  const settings = useSettings(preferences);
  const muted = { color: view.theme.colors.foregroundMuted, fontSize: 12, padding: RAIL };
  const save = useCallback(
    (next: Preferences) => {
      if (settings.status !== "ready") return;
      void settings.save(next, settings.revision);
    },
    [settings],
  );
  if (settings.status === "loading") return <Text style={muted}>{t("loading")}</Text>;
  if (settings.status !== "ready") {
    return (
      <View>
        <Text style={muted}>{settings.error}</Text>
        <Pressable accessibilityRole="button" onPress={settings.reload}>
          <Text style={{ ...muted, color: view.theme.colors.accent }}>{t("retry")}</Text>
        </Pressable>
        {settings.status === "invalid" ? (
          <Pressable accessibilityRole="button" onPress={settings.reset}>
            <Text style={{ ...muted, color: view.theme.colors.accent }}>{t("reset")}</Text>
          </Pressable>
        ) : null}
      </View>
    );
  }
  return <Sidebar view={view} values={settings.values} save={save} />;
}
