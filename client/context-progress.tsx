import type {
  PluginButtonContentProps,
  PluginButtonIconProps,
} from "@getpaseo/plugin/client";
import { useEffect, useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import {
  CONTEXT_LIMIT,
  contextUsageKey,
  contextUsageStore,
  getContextProgressState,
  formatTokenCount,
  type ContextProgressState,
} from "./progress";

const RING_SEGMENTS = 32;

function useContextUsage(workspaceId: string, agentId: string): number | null {
  const key = contextUsageKey(workspaceId, agentId);
  const [usage, setUsage] = useState<number | null>(() => contextUsageStore.get(key));

  useEffect(() => {
    const removeSubscription = contextUsageStore.subscribe(key, () => {
      setUsage(contextUsageStore.get(key));
    });
    setUsage(contextUsageStore.get(key));

    return () => {
      removeSubscription();
    };
  }, [key]);

  return usage;
}

function progressStateForUsage(usage: number | null): ContextProgressState {
  return getContextProgressState(usage);
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
  workspaceId,
  agentId,
  size,
  color,
  theme,
}: Extract<PluginButtonIconProps, { context: "agent" }>) {
  const usage = useContextUsage(workspaceId, agentId);
  const state = progressStateForUsage(usage);
  const progressColor =
    state.level === "danger"
      ? theme.colors.statusDanger
      : state.level === "warning"
        ? theme.colors.statusWarning
        : color;

  return (
    <ContextRing
      size={size}
      progress={state.progress}
      color={progressColor}
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

function AgentContextProgressPopover({
  workspaceId,
  agentId,
  theme,
  layout,
  close,
}: Extract<PluginButtonContentProps, { context: "agent" }>) {
  const usage = useContextUsage(workspaceId, agentId);
  const state = progressStateForUsage(usage);
  const progressColor =
    state.level === "danger"
      ? theme.colors.statusDanger
      : state.level === "warning"
        ? theme.colors.statusWarning
        : theme.colors.foreground;
  const styles = useMemo(
    () => ({
      body: { gap: layout.compact ? 8 : 10 },
      title: { color: theme.colors.foreground, fontSize: 16, fontWeight: "600" as const },
      value: { color: progressColor, fontSize: 14 },
      detail: { color: theme.colors.foregroundMuted, fontSize: 12 },
      button: {
        alignSelf: "flex-start" as const,
        paddingVertical: 7,
        paddingHorizontal: 10,
        borderRadius: 6,
        backgroundColor: theme.colors.surface2,
      },
      buttonText: { color: theme.colors.foreground, fontSize: 12 },
    }),
    [layout.compact, progressColor, theme],
  );

  return (
    <View style={styles.body}>
      <Text style={styles.title}>Context usage</Text>
      <Text style={styles.value}>
        {formatTokenCount(state.usedTokens)} / {formatTokenCount(CONTEXT_LIMIT)} tokens
      </Text>
      <Text style={styles.detail}>
        {state.level === "danger"
          ? "Over the 200k limit"
          : state.level === "warning"
            ? "Over the 150k warning level"
            : "Warning at 150k; limit at 200k"}
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Close context usage"
        onPress={close}
        style={styles.button}
      >
        <Text style={styles.buttonText}>Done</Text>
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
