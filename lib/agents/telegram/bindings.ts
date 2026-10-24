import "server-only";
import type { TelegramHostOptions } from "@spaceworks-hq/agents/telegram";
import { createInventoryOpsAdapter } from "../adapter";
import { inventoryAgentActivation } from "../activation";
import { inventoryTelegramConfig } from "./config";
import { inventoryTelegramLinks } from "./links";

/** Compile this trusted module; loading it never starts polling or creates identities. */
export async function configureTelegram(input: { mode: string; namespace: string; root: string }): Promise<TelegramHostOptions> {
  if (input.mode !== "inventory") throw new Error("Use the separate Inventory bot.");
  const config = await inventoryTelegramConfig(input.root, input.namespace);
  const links = await inventoryTelegramLinks(input.root, input.namespace);
  return { mode: "inventory", namespace: config.namespace, hostUrl: config.hostUrl,
    adapter: createInventoryOpsAdapter(), activation: inventoryAgentActivation,
    resolveActor: identity => links.resolve(identity), linkAccount: (identity, code) => links.redeem(identity, code) };
}
