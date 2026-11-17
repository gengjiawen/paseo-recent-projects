import { memo, useCallback, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import {
  useProject,
  useTranslation,
  useWorkspace,
  type PluginSidebarViewProps,
  type ProjectRef,
  type WorkspaceRef,
} from "@getpaseo/plugin/client";
import { Icon } from "@getpaseo/plugin/client/react-native";
import type { PluginWorkspaceSnapshot, WorkspaceIndicator } from "@getpaseo/plugin";
import { ProjectMark, useProjectIcon } from "./icon";
import { messages } from "./messages";

type Theme = PluginSidebarViewProps["theme"];

// Density from the sidebar view guide: 28pt rows, 12pt rail, 12/16 primary, 11 secondary. Compact
// layouts are touch-first, so their rows grow to a finger-sized target.
export const RAIL = 12;

export function density(view: PluginSidebarViewProps) {
  return view.layout.compact
    ? { row: 40, primary: 15, line: 20, secondary: 13 }
    : { row: 28, primary: 12, line: 16, secondary: 11 };
}
const SLOT = 16;
const DOT = 7;

// Touch layouts have no hover, so their row controls stay visible. On web, hover is tracked on a
// plain View around the row: the press target and the row button are siblings inside it, so moving
// onto the button never ends the hover, and no <button> nests inside another.
export function useRowControls(view: PluginSidebarViewProps) {
  const [hovered, setHovered] = useState(false);
  const alwaysVisible = view.layout.platform !== "web" || view.layout.compact;
  return {
    hovered: hovered && !alwaysVisible,
    visible: alwaysVisible || hovered,
    onPointerEnter: useCallback(() => setHovered(true), []),
    onPointerLeave: useCallback(() => setHovered(false), []),
  };
}

export function StatusIcon({ indicator, theme }: { indicator: WorkspaceIndicator; theme: Theme }) {
  let content;
  if (indicator === "running") {
    content = (
      <ActivityIndicator size="small" color={theme.colors.accent} style={{ transform: [{ scale: 0.6 }] }} />
    );
  } else if (indicator === "needs_input") {
    content = <Icon name="CircleAlert" size={13} color={theme.colors.statusWarning} />;
  } else {
    const color =
      indicator === "failed"
        ? theme.colors.statusDanger
        : indicator === "attention"
          ? theme.colors.statusSuccess
          : theme.colors.foregroundMuted;
    content = (
      <View
        style={{
          width: DOT,
          height: DOT,
          borderRadius: DOT,
          backgroundColor: color,
          opacity: indicator === "done" ? 0.45 : 1,
        }}
      />
    );
  }
  return (
    <View
      testID={`recent-projects-status-${indicator}`}
      style={{ width: SLOT, height: 16, alignItems: "center", justifyContent: "center" }}
    >
      {content}
    </View>
  );
}

// The guide's selected fill (surface2) equals the light sidebar background, so selection and hover
// are drawn as a foreground tint, which shows on every theme.
export function RowFill({ theme, selected, hovered }: { theme: Theme; selected: boolean; hovered: boolean }) {
  if (!selected && !hovered) return null;
  return (
    <View
      pointerEvents="none"
      style={{
        position: "absolute",
        top: 0,
        right: 0,
        bottom: 0,
        left: 0,
        backgroundColor: theme.colors.foreground,
        opacity: selected ? 0.1 : 0.05,
      }}
    />
  );
}

function pickRow(workspace: PluginWorkspaceSnapshot) {
  return {
    label: workspace.title ?? workspace.name,
    indicator: workspace.indicator,
    indicatorLabel: workspace.indicatorLabel,
    project: workspace.projectDisplayName,
    additions: workspace.diffStat?.additions ?? 0,
    deletions: workspace.diffStat?.deletions ?? 0,
  };
}

export const WorkspaceRow = memo(function WorkspaceRow({
  reference,
  view,
  indent,
  showProject = false,
  onActions,
}: {
  reference: WorkspaceRef;
  view: PluginSidebarViewProps;
  indent: number;
  showProject?: boolean;
  onActions(reference: WorkspaceRef): void;
}) {
  const { t } = useTranslation(messages);
  const row = useWorkspace(reference, pickRow);
  const controls = useRowControls(view);
  const { theme } = view;
  const size = density(view);
  const active = view.active.workspace?.key === reference.key;
  const open = useCallback(() => view.navigation.openWorkspace(reference), [view.navigation, reference]);
  const actions = useCallback(() => onActions(reference), [onActions, reference]);
  const styles = useMemo(
    () => ({
      label: { flexShrink: 1, color: theme.colors.foreground, fontSize: size.primary, lineHeight: size.line },
      project: {
        flexShrink: 2,
        color: theme.colors.foregroundMuted,
        fontSize: size.secondary,
        lineHeight: size.line,
      },
      // Never let the title squeeze the diff stat into "+116…".
      diff: {
        flexShrink: 0,
        fontSize: size.secondary,
        lineHeight: size.line,
        fontVariant: ["tabular-nums" as const],
      },
    }),
    [theme, size],
  );
  if (!row) return null;
  return (
    <View
      onPointerEnter={controls.onPointerEnter}
      onPointerLeave={controls.onPointerLeave}
      style={{
        minHeight: size.row,
        flexDirection: "row",
        alignItems: "center",
        paddingRight: 6,
      }}
    >
      <RowFill theme={theme} selected={active} hovered={controls.hovered} />
      <Pressable
        testID={`recent-projects-workspace-${reference.key}`}
        accessibilityRole="button"
        accessibilityLabel={t("openWorkspace", { workspace: row.label })}
        accessibilityHint={row.indicatorLabel ?? undefined}
        onPress={open}
        onLongPress={actions}
        style={({ pressed }) => ({
          flex: 1,
          minHeight: size.row,
          flexDirection: "row",
          alignItems: "center",
          gap: 6,
          paddingLeft: RAIL + indent,
          paddingRight: 6,
          opacity: pressed ? 0.7 : 1,
        })}
      >
        <StatusIcon indicator={row.indicator} theme={theme} />
        <Text numberOfLines={1} style={styles.label}>
          {row.label}
        </Text>
        {showProject ? (
          <Text numberOfLines={1} style={styles.project}>
            {row.project}
          </Text>
        ) : null}
        <View style={{ flex: 1 }} />
        {row.additions || row.deletions ? (
          <Text numberOfLines={1} style={styles.diff}>
            <Text style={{ color: theme.colors.statusSuccess }}>+{row.additions}</Text>{" "}
            <Text style={{ color: theme.colors.statusDanger }}>−{row.deletions}</Text>
          </Text>
        ) : null}
      </Pressable>
      <RowButton
        testID={`recent-projects-actions-${reference.key}`}
        visible={controls.visible}
        icon="Ellipsis"
        label={t("workspaceActions", { workspace: row.label })}
        onPress={actions}
        theme={theme}
      />
    </View>
  );
});

/** "Show N more" / "Show less" under a project that has more workspaces than the preview shows. */
export function ShowMoreRow({
  view,
  indent,
  label,
  onPress,
  testID,
}: {
  view: PluginSidebarViewProps;
  indent: number;
  label: string;
  onPress(): void;
  testID?: string;
}) {
  const { theme } = view;
  const size = density(view);
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: view.layout.compact ? 32 : 24,
        justifyContent: "center",
        // Line up with workspace titles: rail + indent + status slot + gap.
        paddingLeft: RAIL + indent + SLOT + 6,
        paddingRight: 6,
        backgroundColor: pressed ? theme.colors.surface1 : undefined,
      })}
    >
      <Text style={{ color: theme.colors.foregroundMuted, fontSize: size.secondary }}>{label}</Text>
    </Pressable>
  );
}

export function RowButton({
  visible,
  icon,
  label,
  onPress,
  theme,
  testID,
}: {
  visible: boolean;
  icon: string;
  label: string;
  onPress(): void;
  theme: Theme;
  testID?: string;
}) {
  // Keep the slot when hidden so hovering never shifts the row's text.
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={!visible}
      onPress={onPress}
      hitSlop={6}
      style={({ pressed }) => ({
        width: 20,
        height: 20,
        borderRadius: 4,
        alignItems: "center",
        justifyContent: "center",
        opacity: visible ? 1 : 0,
        backgroundColor: pressed ? theme.colors.surface2 : undefined,
      })}
    >
      <Icon name={icon} size={14} color={theme.colors.foregroundMuted} />
    </Pressable>
  );
}

export const ProjectHeader = memo(function ProjectHeader({
  reference,
  view,
  collapsed,
  hiddenCount,
  hostLabel,
  onToggle,
}: {
  reference: ProjectRef;
  view: PluginSidebarViewProps;
  collapsed: boolean;
  hiddenCount: number;
  hostLabel: string | null;
  onToggle(key: string): void;
}) {
  const { t } = useTranslation(messages);
  const project = useProject(reference);
  const icon = useProjectIcon(project);
  const controls = useRowControls(view);
  const { theme } = view;
  const size = density(view);
  const toggle = useCallback(() => onToggle(reference.key), [onToggle, reference.key]);
  const create = useCallback(() => view.navigation.openProject(reference), [view.navigation, reference]);
  if (!project) return null;
  const name = project.displayName;
  return (
    <View
      onPointerEnter={controls.onPointerEnter}
      onPointerLeave={controls.onPointerLeave}
      style={{ minHeight: size.row, marginTop: 4, flexDirection: "row", alignItems: "center", paddingRight: 6 }}
    >
      <RowFill theme={theme} selected={false} hovered={controls.hovered} />
      <Pressable
        testID={`recent-projects-project-${reference.key}`}
        accessibilityRole="button"
        accessibilityState={{ expanded: !collapsed }}
        accessibilityLabel={t(collapsed ? "expand" : "collapse", { project: name })}
        onPress={toggle}
        style={({ pressed }) => ({
          flex: 1,
          minHeight: size.row,
          flexDirection: "row",
          alignItems: "center",
          gap: 6,
          paddingLeft: RAIL,
          paddingRight: 6,
          opacity: pressed ? 0.7 : 1,
        })}
      >
        <View style={{ width: SLOT, alignItems: "center" }}>
          <Icon
            name={collapsed ? "ChevronRight" : "ChevronDown"}
            size={14}
            color={theme.colors.foregroundMuted}
          />
        </View>
        {icon ? <ProjectMark icon={icon} view={view} /> : null}
        <Text
          numberOfLines={1}
          style={{
            flexShrink: 1,
            color: theme.colors.foreground,
            fontSize: size.primary,
            lineHeight: size.line,
            fontWeight: "600",
          }}
        >
          {name}
        </Text>
        {hostLabel ? (
          <Text numberOfLines={1} style={{ color: theme.colors.foregroundMuted, fontSize: size.secondary }}>
            {hostLabel}
          </Text>
        ) : null}
        {collapsed && hiddenCount > 0 ? (
          <Text style={{ color: theme.colors.foregroundMuted, fontSize: size.secondary }}>{hiddenCount}</Text>
        ) : null}
      </Pressable>
      <RowButton
        testID={`recent-projects-new-${reference.key}`}
        visible={controls.visible}
        icon="Plus"
        label={t("newWorkspace", { project: name })}
        onPress={create}
        theme={theme}
      />
    </View>
  );
});
