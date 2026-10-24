import "server-only";

import { locationTree } from "@/lib/catalogue/locations";
import type { DbClient } from "@/lib/db";

/** Active locations of a space as picker options ("Main room › Shelf B", code). */
export async function locationOptions(spaceId: string, client?: DbClient) {
  const tree = await locationTree(spaceId, client);
  return tree.map((location) => ({ id: location.id, path: location.path, code: location.code }));
}
