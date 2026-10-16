import type { PluginClientContext } from "@getpaseo/plugin/client";
import { ContextProgressIcon, ContextProgressPopover } from "./client/context-progress";
import { observeContextPills } from "./client/pills.ts";

export default function contribute(client: PluginClientContext) {
  return observeContextPills(client, {
    icon: ContextProgressIcon,
    behavior: { kind: "popover", Content: ContextProgressPopover },
  });
}
