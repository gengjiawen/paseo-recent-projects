import { useCallback, useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";
import {
  usePaseo,
  useTranslation,
  useWorkspace,
  type PluginSidebarViewProps,
  type WorkspaceRef,
} from "@getpaseo/plugin/client";
import { copyText, Icon, Modal, TextInput, useToast } from "@getpaseo/plugin/client/react-native";
import { messages } from "./messages";

type Theme = PluginSidebarViewProps["theme"];

function ActionRow({
  icon,
  label,
  onPress,
  theme,
  danger = false,
  disabled = false,
  testID,
}: {
  icon: string;
  label: string;
  onPress(): void;
  theme: Theme;
  danger?: boolean;
  disabled?: boolean;
  testID?: string;
}) {
  const color = danger ? theme.colors.statusDanger : theme.colors.foreground;
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
        minHeight: 40,
        paddingHorizontal: 12,
        borderRadius: 6,
        opacity: disabled ? 0.5 : 1,
        backgroundColor: pressed ? theme.colors.surface2 : theme.colors.surface1,
      })}
    >
      <Icon name={icon} size={16} color={color} />
      <Text style={{ color, fontSize: 14 }}>{label}</Text>
    </Pressable>
  );
}

function pickActions(workspace: { title: string | null; name: string; pinnedAt: string | null; directory: string }) {
  return {
    label: workspace.title ?? workspace.name,
    title: workspace.title,
    pinned: workspace.pinnedAt !== null,
    directory: workspace.directory,
  };
}

/** Long-press menu for one workspace: the everyday row actions the plugin API exposes. */
export function WorkspaceActions({
  reference,
  theme,
  onClose,
}: {
  reference: WorkspaceRef;
  theme: Theme;
  onClose(): void;
}) {
  const { t } = useTranslation(messages);
  const paseo = usePaseo();
  const toast = useToast();
  const workspace = useWorkspace(reference, pickActions);
  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState("");
  const [confirmArchive, setConfirmArchive] = useState(false);
  const [busy, setBusy] = useState(false);

  // A deleted or archived workspace closes its menu.
  useEffect(() => {
    if (!workspace) onClose();
  }, [workspace, onClose]);

  const run = useCallback(
    async (action: () => Promise<unknown>) => {
      setBusy(true);
      try {
        await action();
        onClose();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : String(error));
      } finally {
        setBusy(false);
      }
    },
    [onClose, toast],
  );

  const handle = paseo.workspaces.ref(reference);
  const togglePin = useCallback(
    () => run(() => handle.setPinned(!workspace?.pinned)),
    [run, handle, workspace?.pinned],
  );
  const startRename = useCallback(() => {
    setDraft(workspace?.title ?? workspace?.label ?? "");
    setRenaming(true);
  }, [workspace]);
  const saveRename = useCallback(
    () => run(() => handle.setTitle(draft.trim() ? draft.trim() : null)),
    [run, handle, draft],
  );
  const copyPath = useCallback(async () => {
    if (!workspace) return;
    await copyText(workspace.directory);
    toast.show(t("copied"), { variant: "success" });
    onClose();
  }, [workspace, toast, t, onClose]);
  const archive = useCallback(() => {
    if (!confirmArchive) {
      setConfirmArchive(true);
      return;
    }
    void run(() => handle.archive());
  }, [confirmArchive, run, handle]);

  if (!workspace) return null;
  return (
    <Modal title={workspace.label} open onOpenChange={(open) => (open ? undefined : onClose())}>
      <Modal.Content>
        {renaming ? (
          <View style={{ gap: 8 }}>
            <TextInput
              testID="recent-projects-rename-input"
              value={draft}
              onChangeText={setDraft}
              placeholder={t("titlePlaceholder")}
              autoFocus
              onSubmitEditing={saveRename}
            />
            <View style={{ flexDirection: "row", gap: 8 }}>
              <View style={{ flex: 1 }}>
                <ActionRow icon="X" label={t("cancel")} onPress={() => setRenaming(false)} theme={theme} />
              </View>
              <View style={{ flex: 1 }}>
                <ActionRow
                  testID="recent-projects-rename-save"
                  icon="Check"
                  label={t("save")}
                  onPress={saveRename}
                  theme={theme}
                  disabled={busy}
                />
              </View>
            </View>
          </View>
        ) : (
          <View style={{ gap: 6 }}>
            <ActionRow
              testID="recent-projects-action-pin"
              icon={workspace.pinned ? "PinOff" : "Pin"}
              label={t(workspace.pinned ? "unpin" : "pin")}
              onPress={togglePin}
              theme={theme}
              disabled={busy}
            />
            <ActionRow
              testID="recent-projects-action-rename"
              icon="Pencil"
              label={t("rename")}
              onPress={startRename}
              theme={theme}
              disabled={busy}
            />
            <ActionRow icon="Copy" label={t("copyPath")} onPress={copyPath} theme={theme} disabled={busy} />
            <ActionRow
              testID="recent-projects-action-archive"
              icon="Archive"
              label={t(confirmArchive ? "confirmArchive" : "archive")}
              onPress={archive}
              theme={theme}
              danger
              disabled={busy}
            />
          </View>
        )}
      </Modal.Content>
    </Modal>
  );
}
