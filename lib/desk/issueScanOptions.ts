type Asset = { qrCode: string; assetTag: string; itemId: string; status: string; item: { name: string } };
type Container = { qrCode: string; code: string; name: string | null; loans: readonly { id: string }[] };

/** Only free tags count; unavailable codes retain a label for an immediate scan refusal. */
export function issueScanOptions(assets: readonly Asset[], containers: readonly Container[]) {
  return {
    assets: Object.fromEntries(assets.filter((a) => a.status === "AVAILABLE").map((a) => [a.qrCode, { itemId: a.itemId, label: `${a.item.name} · ${a.assetTag}` }])),
    containers: containers.filter((c) => c.loans.length === 0).map((c) => ({ code: c.qrCode, label: c.name ? `Container ${c.code} · ${c.name}` : `Container ${c.code}` })),
    unavailable: Object.fromEntries([
      ...assets.filter((a) => a.status !== "AVAILABLE").map((a) => [a.qrCode, a.assetTag]),
      ...containers.filter((c) => c.loans.length > 0).map((c) => [c.qrCode, `Container ${c.code}`]),
    ]),
  };
}
