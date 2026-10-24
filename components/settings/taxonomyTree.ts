/**
 * Order categories as a tree (each parent followed by its children,
 * alphabetically at every level) with their depth. Orphans whose parent is
 * missing are shown at the top level. Pure and client-safe.
 */
export function treeOrder<T extends { id: string; parentId: string | null; name: string }>(rows: readonly T[]): Array<T & { depth: number }> {
  const ids = new Set(rows.map((row) => row.id));
  const children = new Map<string | null, T[]>();
  for (const row of rows) {
    const parent = row.parentId && ids.has(row.parentId) ? row.parentId : null;
    const list = children.get(parent) ?? [];
    list.push(row);
    children.set(parent, list);
  }
  const out: Array<T & { depth: number }> = [];
  const seen = new Set<string>();
  const visit = (parent: string | null, depth: number) => {
    for (const row of [...(children.get(parent) ?? [])].sort((a, b) => a.name.localeCompare(b.name))) {
      if (seen.has(row.id)) continue;
      seen.add(row.id);
      out.push({ ...row, depth });
      visit(row.id, depth + 1);
    }
  };
  visit(null, 0);
  // Cycles can't be saved, but never drop a row if one slipped through.
  for (const row of rows) if (!seen.has(row.id)) out.push({ ...row, depth: 0 });
  return out;
}
