import { Pressable, Text, View } from "react-native";
import { useTranslation, type PluginSidebarViewProps } from "@getpaseo/plugin/client";
import { Icon, Modal } from "@getpaseo/plugin/client/react-native";
import {
  PROJECT_ORDERS,
  WORKSPACE_ORDERS,
  type ProjectOrder,
  type WorkspaceOrder,
} from "../shared/preferences";
import { messages } from "./messages";

type Theme = PluginSidebarViewProps["theme"];

export interface Preferences {
  projectOrder: ProjectOrder;
  workspaceOrder: WorkspaceOrder;
  showBackground: boolean;
  collapsed: string[];
}

export const PROJECT_ORDER_LABEL = {
  activity: "projectOrderActivity",
  prompt: "projectOrderPrompt",
  name: "projectOrderName",
} as const satisfies Record<ProjectOrder, string>;

const WORKSPACE_ORDER_LABEL = {
  created: "workspaceOrderCreated",
  prompt: "workspaceOrderPrompt",
  activity: "workspaceOrderActivity",
} as const satisfies Record<WorkspaceOrder, string>;

function Choice({
  label,
  selected,
  onPress,
  theme,
  testID,
}: {
  label: string;
  selected: boolean;
  onPress(): void;
  theme: Theme;
  testID?: string;
}) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        minHeight: 40,
        paddingHorizontal: 12,
        backgroundColor: pressed ? theme.colors.surface2 : undefined,
      })}
    >
      <Text style={{ color: theme.colors.foreground, fontSize: 14 }}>{label}</Text>
      {selected ? <Icon name="Check" size={16} color={theme.colors.accent} /> : null}
    </Pressable>
  );
}

function Section({ title, theme, children }: { title: string; theme: Theme; children: React.ReactNode }) {
  return (
    <View style={{ gap: 4 }}>
      <Text style={{ color: theme.colors.foregroundMuted, fontSize: 12 }}>{title}</Text>
      <View
        style={{
          borderRadius: 8,
          borderWidth: 1,
          borderColor: theme.colors.border,
          backgroundColor: theme.colors.surface1,
          overflow: "hidden",
        }}
      >
        {children}
      </View>
    </View>
  );
}

export function OptionsModal({
  values,
  theme,
  onChange,
  onClose,
}: {
  values: Preferences;
  theme: Theme;
  onChange(next: Preferences): void;
  onClose(): void;
}) {
  const { t } = useTranslation(messages);
  return (
    <Modal title={t("options")} open onOpenChange={(open) => (open ? undefined : onClose())}>
      <Modal.Content>
        <Section title={t("projectOrder")} theme={theme}>
          {PROJECT_ORDERS.map((order) => (
            <Choice
              key={order}
              testID={`recent-projects-project-order-${order}`}
              label={t(PROJECT_ORDER_LABEL[order])}
              selected={values.projectOrder === order}
              onPress={() => onChange({ ...values, projectOrder: order })}
              theme={theme}
            />
          ))}
        </Section>
        <Section title={t("workspaceOrder")} theme={theme}>
          {WORKSPACE_ORDERS.map((order) => (
            <Choice
              key={order}
              testID={`recent-projects-workspace-order-${order}`}
              label={t(WORKSPACE_ORDER_LABEL[order])}
              selected={values.workspaceOrder === order}
              onPress={() => onChange({ ...values, workspaceOrder: order })}
              theme={theme}
            />
          ))}
        </Section>
        <Section title={t("visibility")} theme={theme}>
          <Choice
            testID="recent-projects-show-background"
            label={t("showBackground")}
            selected={values.showBackground}
            onPress={() => onChange({ ...values, showBackground: !values.showBackground })}
            theme={theme}
          />
        </Section>
      </Modal.Content>
    </Modal>
  );
}
