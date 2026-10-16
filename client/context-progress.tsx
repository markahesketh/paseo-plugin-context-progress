import type {
  PluginButtonContentProps,
  PluginButtonIconProps,
} from "@getpaseo/plugin/client";
import { useSyncExternalStore } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import {
  CONTEXT_LIMIT,
  contextUsageStore,
  formatTokenCount,
  formatTokensShort,
  getContextProgress,
  type ContextProgress,
} from "./progress";

const RING_SEGMENTS = 32;

const styles = StyleSheet.create({
  title: { fontSize: 16, fontWeight: "600" },
  value: { fontSize: 14 },
  detail: { fontSize: 12 },
  button: {
    alignSelf: "flex-start",
    paddingVertical: 7,
    paddingHorizontal: 10,
    borderRadius: 6,
  },
  buttonText: { fontSize: 12 },
});

function useContextProgress(agentId: string): ContextProgress {
  return getContextProgress(
    useSyncExternalStore(contextUsageStore.subscribe, () => contextUsageStore.get(agentId)),
  );
}

type Theme = PluginButtonIconProps["theme"];

function levelColor(progress: ContextProgress, theme: Theme, normalColor: string): string {
  switch (progress.level) {
    case "danger":
      return theme.colors.statusDanger;
    case "warning":
      return theme.colors.statusWarning;
    default:
      return normalColor;
  }
}

function ContextRing({
  size,
  progress,
  color,
  trackColor,
}: {
  size: number;
  progress: number;
  color: string;
  trackColor: string;
}) {
  const activeSegments = Math.ceil(progress * RING_SEGMENTS);
  const segmentSize = Math.max(1.5, size * 0.14);
  const segmentLength = Math.max(2, size * 0.16);

  return (
    <View style={{ width: size, height: size, position: "relative" }}>
      {Array.from({ length: RING_SEGMENTS }, (_, index) => (
        <View
          key={index}
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: size,
            height: size,
            transform: [{ rotate: `${(index * 360) / RING_SEGMENTS}deg` }],
          }}
        >
          <View
            style={{
              position: "absolute",
              top: 0,
              left: (size - segmentSize) / 2,
              width: segmentSize,
              height: segmentLength,
              borderRadius: segmentSize / 2,
              backgroundColor: index < activeSegments ? color : trackColor,
            }}
          />
        </View>
      ))}
    </View>
  );
}

function AgentContextProgressIcon({
  agentId,
  size,
  color,
  theme,
}: Extract<PluginButtonIconProps, { context: "agent" }>) {
  const progress = useContextProgress(agentId);

  return (
    <ContextRing
      size={size}
      progress={progress.level === "unknown" ? 0 : progress.progress}
      color={levelColor(progress, theme, color)}
      trackColor={theme.colors.border}
    />
  );
}

export function ContextProgressIcon(props: PluginButtonIconProps) {
  if (props.context !== "agent") {
    return <View style={{ width: props.size, height: props.size }} />;
  }

  return <AgentContextProgressIcon {...props} />;
}

function usageDetail(progress: Exclude<ContextProgress, { level: "unknown" }>): string {
  const limit = formatTokensShort(progress.limitTokens);
  const warning = formatTokensShort(progress.warningTokens);
  const source = progress.limitTokens < CONTEXT_LIMIT ? " (the model's context window)" : "";

  switch (progress.level) {
    case "danger":
      return `Over the ${limit} limit${source}`;
    case "warning":
      return `Over the ${warning} warning level`;
    case "normal":
      return `Warning at ${warning}; limit at ${limit}${source}`;
  }
}

function AgentContextProgressPopover({
  agentId,
  theme,
  layout,
  close,
}: Extract<PluginButtonContentProps, { context: "agent" }>) {
  const progress = useContextProgress(agentId);
  const { foreground, foregroundMuted, surface2 } = theme.colors;

  return (
    <View style={{ gap: layout.compact ? 8 : 10 }}>
      {layout.compact ? null : (
        <Text style={[styles.title, { color: foreground }]}>Context usage</Text>
      )}
      {progress.level === "unknown" ? (
        <Text style={[styles.value, { color: foreground }]}>No usage reported yet</Text>
      ) : (
        <>
          <Text style={[styles.value, { color: levelColor(progress, theme, foreground) }]}>
            {formatTokenCount(progress.usedTokens)} / {formatTokenCount(progress.limitTokens)}{" "}
            tokens
          </Text>
          <Text style={[styles.detail, { color: foregroundMuted }]}>{usageDetail(progress)}</Text>
        </>
      )}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Close context usage"
        onPress={close}
        style={[styles.button, { backgroundColor: surface2 }]}
      >
        <Text style={[styles.buttonText, { color: foreground }]}>Done</Text>
      </Pressable>
    </View>
  );
}

export function ContextProgressPopover(props: PluginButtonContentProps) {
  if (props.context !== "agent") {
    return <View />;
  }

  return <AgentContextProgressPopover {...props} />;
}
