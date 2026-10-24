import type { SectionValues } from "@/lib/settings/sections";

/**
 * Pure, client-safe rules for the space setup wizard: the steps, the
 * location quick builder (building → rooms → shelves → bins with generated
 * codes) and the lending quick choices that map onto the fees section.
 */

export const SETUP_STEPS = [
  { key: "details", label: "Space details" },
  { key: "locations", label: "Locations" },
  { key: "categories", label: "Categories and units" },
  { key: "team", label: "Team and roles" },
  { key: "lending", label: "Lending" },
  { key: "data", label: "Data" },
] as const;

export type SetupStepKey = (typeof SETUP_STEPS)[number]["key"];

/** 1-based step number from `?step=`; anything unknown starts at step 1. */
export function setupStep(value: unknown): number {
  const raw = Array.isArray(value) ? value[0] : value;
  const n = typeof raw === "string" && /^\d$/.test(raw) ? Number(raw) : 1;
  return n >= 1 && n <= SETUP_STEPS.length ? n : 1;
}

// ───────────── Locations ─────────────

export type PlannedKind = "BUILDING" | "ROOM" | "SHELF" | "BIN";
export type PlannedLocation = { key: string; parentKey: string | null; kind: PlannedKind; name: string; code: string };
export type RoomPlan = { name: string; shelves: number; binsPerShelf: number };
export type LocationPlanInput = { buildingName: string; buildingCode: string; rooms: RoomPlan[] };

export const LOCATION_CODE_PATTERN = /^[A-Z0-9][A-Z0-9._-]{0,23}$/;
export const MAX_PLANNED_LOCATIONS = 300;

/** A short code from a name: "Main building" → "MB", "Lab" → "LAB". */
export function codeFromName(name: string, fallback: string): string {
  const words = name.toUpperCase().replace(/[^A-Z0-9 ]/g, " ").split(/\s+/).filter(Boolean);
  const code = words.length > 1 ? words.map((word) => word[0]).join("") : (words[0] ?? "").slice(0, 4);
  return code.slice(0, 6) || fallback;
}

const clampCount = (value: number, max: number) => (Number.isSafeInteger(value) ? Math.min(Math.max(value, 0), max) : 0);

/**
 * Generate the rows for one building: rooms R1…, shelves S1… inside each
 * room and bins B1… on each shelf. Codes nest ("MB-R1-S2-B3") so they stay
 * unique and readable on labels.
 */
export function planLocations(input: LocationPlanInput): PlannedLocation[] {
  const buildingCode = (input.buildingCode.trim().toUpperCase() || codeFromName(input.buildingName, "B1")).slice(0, 8);
  const rows: PlannedLocation[] = [{ key: "b", parentKey: null, kind: "BUILDING", name: input.buildingName.trim() || "Main building", code: buildingCode }];
  input.rooms.slice(0, 20).forEach((room, r) => {
    const roomKey = `b.r${r + 1}`;
    const roomCode = `${buildingCode}-R${r + 1}`;
    rows.push({ key: roomKey, parentKey: "b", kind: "ROOM", name: room.name.trim() || `Room ${r + 1}`, code: roomCode });
    for (let s = 1; s <= clampCount(room.shelves, 20); s += 1) {
      const shelfKey = `${roomKey}.s${s}`;
      const shelfCode = `${roomCode}-S${s}`;
      rows.push({ key: shelfKey, parentKey: roomKey, kind: "SHELF", name: `Shelf ${s}`, code: shelfCode });
      for (let b = 1; b <= clampCount(room.binsPerShelf, 20); b += 1) {
        rows.push({ key: `${shelfKey}.b${b}`, parentKey: shelfKey, kind: "BIN", name: `Bin ${b}`, code: `${shelfCode}-B${b}` });
      }
    }
  });
  return rows;
}

/** Why a (possibly edited) plan can't be saved, or null. Parents must come before their children. */
export function locationPlanProblem(rows: readonly PlannedLocation[]): string | null {
  if (rows.length === 0) return "Add at least one location, or skip this step.";
  if (rows.length > MAX_PLANNED_LOCATIONS) return `Add at most ${MAX_PLANNED_LOCATIONS} locations at once.`;
  const seenKeys = new Set<string>();
  const seenCodes = new Set<string>();
  for (const row of rows) {
    if (!row.name.trim()) return "Every location needs a name.";
    if (row.name.trim().length > 80) return `Shorten the name "${row.name.slice(0, 20)}" to 80 characters.`;
    const code = row.code.trim().toUpperCase();
    if (!LOCATION_CODE_PATTERN.test(code)) return `Code ${row.code || "(blank)"} needs up to 24 letters, digits, dots or dashes.`;
    if (seenCodes.has(code)) return `Code ${code} is used twice.`;
    if (row.parentKey !== null && !seenKeys.has(row.parentKey)) return `${row.name} is listed before the place it sits in.`;
    if (seenKeys.has(row.key)) return "Each location needs its own key.";
    seenKeys.add(row.key);
    seenCodes.add(code);
  }
  return null;
}

// ───────────── Lending quick choices ─────────────

export type FeesValues = SectionValues<"fees">;
export type LendingChoice = "free" | "deposit" | "rental";

export const LENDING_CHOICES: readonly { value: LendingChoice; label: string; description: string }[] = [
  { value: "free", label: "Free", description: "Members borrow without paying anything." },
  { value: "deposit", label: "Refundable deposit", description: "A fixed deposit per loan, returned when everything comes back." },
  { value: "rental", label: "Rental", description: "A daily rental fee; no deposit." },
];

/** Which quick choice the current fees match (anything else counts as the closest one). */
export function lendingChoiceOf(fees: Pick<FeesValues, "depositMode" | "rentalMode">): LendingChoice {
  if (fees.rentalMode !== "FREE") return "rental";
  if (fees.depositMode !== "NONE") return "deposit";
  return "free";
}

/**
 * Map a quick choice onto the full fees section, keeping the settings the
 * wizard doesn't ask about (late fees, damage charges, pay later).
 */
export function feesForChoice(current: FeesValues, choice: LendingChoice, amountMinor: number): FeesValues {
  const amount = Number.isSafeInteger(amountMinor) && amountMinor > 0 ? amountMinor : 0;
  if (choice === "free") {
    return { ...current, depositMode: "NONE", depositMinor: 0, rentalMode: "FREE", rentalMinor: 0, lateFeePerDayMinor: 0, lateFeeCapMinor: 0, damageChargeMode: "NONE", damageChargeMinor: 0 };
  }
  if (choice === "deposit") return { ...current, depositMode: "FIXED", depositMinor: amount, rentalMode: "FREE", rentalMinor: 0 };
  return { ...current, rentalMode: "PER_DAY", rentalMinor: amount, depositMode: "NONE", depositMinor: 0 };
}
