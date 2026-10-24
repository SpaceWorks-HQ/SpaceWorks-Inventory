import { SKU_PATTERN, locationKinds } from "@/lib/catalogue/schemas";
import { parseMoneyToMinor } from "@/lib/format/money";
import type { ImportKind } from "./columns";

/**
 * Field-level checks for one import row (pure, client-safe). A value of
 * `null` means "not given": new records take the default, updates keep the
 * existing value. Cross-row and database checks live in `validate.ts`.
 */
type LocationKind = (typeof locationKinds)[number];

export type LocationRow = { name: string; code: string; kind: LocationKind; parentCode: string | null; description: string | null };
export type CategoryRow = { name: string; parent: string | null; description: string | null };
export type ItemRow = {
  sku: string | null; name: string; category: string | null; unit: string | null; tracking: "QUANTITY" | "SERIALIZED" | null;
  description: string | null; brand: string | null; model: string | null; unitCostMinor: number | null;
  reorderPoint: number | null; reorderQuantity: number | null; lendable: boolean | null; consumable: boolean | null;
  selfCheckout: boolean | null; loanDays: number | null; depositMinor: number | null; tags: string[] | null;
};
export type StockRow = { sku: string; locationCode: string; quantity: number; unitCostMinor: number | null };
export type AssetRow = { sku: string; locationCode: string; serialNumber: string | null; purchaseCostMinor: number | null; purchasedAt: string | null };

export type RowData = { locations: LocationRow; categories: CategoryRow; items: ItemRow; stock: StockRow; assets: AssetRow };
export type ParsedRow<K extends ImportKind = ImportKind> = { data: RowData[K] | null; errors: string[] };

const LABELS: Record<string, string> = {
  name: "Name", code: "Code", kind: "Kind", parent_code: "Parent code", parent: "Parent", description: "Description",
  sku: "SKU", category: "Category", unit: "Unit", tracking: "Tracking", brand: "Brand", model: "Model",
  unit_cost: "Unit cost", reorder_point: "Reorder point", reorder_quantity: "Reorder quantity", lendable: "Lendable",
  consumable: "Consumable", self_checkout: "Self checkout", loan_days: "Loan days", deposit: "Deposit", tags: "Tags",
  location_code: "Location code", quantity: "Quantity", serial_number: "Serial number", purchase_cost: "Purchase cost", purchased_at: "Purchased at",
};
const MAX_MONEY_MINOR = 100_000_000;
export const LOCATION_CODE_PATTERN = /^[A-Z0-9][A-Z0-9._-]{0,23}$/;

class Reader {
  readonly errors: string[] = [];
  constructor(private readonly record: Record<string, string>, private readonly currency: string) {}

  private raw(key: string) {
    return (this.record[key] ?? "").trim();
  }

  fail(key: string, message: string) {
    this.errors.push(`${LABELS[key] ?? key} ${message}`);
  }

  text(key: string, max: number, required = false): string | null {
    const value = this.raw(key);
    if (!value) {
      if (required) this.fail(key, "is required.");
      return null;
    }
    if (value.length > max) this.fail(key, `can be at most ${max} characters.`);
    return value;
  }

  int(key: string, min: number, max: number, required = false): number | null {
    const value = this.raw(key).replace(/,/g, "");
    if (!value) {
      if (required) this.fail(key, "is required.");
      return null;
    }
    const number = /^-?\d+(\.0+)?$/.test(value) ? Number.parseInt(value, 10) : Number.NaN;
    if (!Number.isSafeInteger(number) || number < min || number > max) {
      this.fail(key, min > 0 ? `must be a whole number from ${min} to ${max}.` : `must be a whole number up to ${max}.`);
      return null;
    }
    return number;
  }

  money(key: string): number | null {
    const value = this.raw(key);
    if (!value) return null;
    // parseMoneyToMinor drops a leading sign along with currency symbols; amounts here are never negative.
    const minor = value.includes("-") ? null : parseMoneyToMinor(value, this.currency);
    if (minor === null || minor > MAX_MONEY_MINOR) {
      this.fail(key, `must be an amount in ${this.currency} like 1250.50.`);
      return null;
    }
    return minor;
  }

  bool(key: string): boolean | null {
    const value = this.raw(key).toLowerCase();
    if (!value) return null;
    if (["yes", "y", "true", "1", "x"].includes(value)) return true;
    if (["no", "n", "false", "0"].includes(value)) return false;
    this.fail(key, "must be yes or no.");
    return null;
  }

  date(key: string): string | null {
    const value = this.raw(key);
    if (!value) return null;
    const match = value.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ].*)?$/);
    const date = match ? new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]))) : null;
    if (!match || !date || date.getUTCDate() !== Number(match[3]) || date.getUTCFullYear() < 1970 || date.getTime() > Date.now() + 86_400_000) {
      this.fail(key, "must be a past date like 2025-03-31.");
      return null;
    }
    return date.toISOString().slice(0, 10);
  }

  sku(key: string, required: boolean): string | null {
    const value = this.text(key, 40, required);
    if (value && !SKU_PATTERN.test(value)) this.fail(key, "can use letters, digits, dots, dashes or underscores only.");
    return value;
  }

  locationCode(key: string, required: boolean): string | null {
    const value = this.text(key, 24, required)?.toUpperCase() ?? null;
    if (value && !LOCATION_CODE_PATTERN.test(value)) this.fail(key, "can use up to 24 letters, digits, dots or dashes.");
    return value;
  }
}

function parseTracking(reader: Reader, value: string | null): "QUANTITY" | "SERIALIZED" | null {
  if (!value) return null;
  const word = value.toLowerCase();
  if (["quantity", "qty", "count", "bulk"].includes(word)) return "QUANTITY";
  if (["serialized", "serialised", "serial", "asset", "assets", "individual"].includes(word)) return "SERIALIZED";
  reader.fail("tracking", "must be quantity or serialized.");
  return null;
}

/** "soldering, Electronics; soldering" → ["soldering", "Electronics"]. */
export function parseTags(value: string): string[] {
  return [...new Set(value.split(/[;,|]/).map((tag) => tag.trim()).filter(Boolean))];
}

function parseItem(reader: Reader, record: Record<string, string>): ItemRow {
  const tracking = parseTracking(reader, reader.text("tracking", 20));
  const tags = record.tags?.trim() ? parseTags(record.tags) : null;
  if (tags && (tags.length > 20 || tags.some((tag) => tag.length > 32))) reader.fail("tags", "can list up to 20 tags of at most 32 characters.");
  const row: ItemRow = {
    sku: reader.sku("sku", false),
    name: reader.text("name", 120, true) ?? "",
    category: reader.text("category", 60),
    unit: reader.text("unit", 30),
    tracking,
    description: reader.text("description", 2000),
    brand: reader.text("brand", 80),
    model: reader.text("model", 80),
    unitCostMinor: reader.money("unit_cost"),
    reorderPoint: reader.int("reorder_point", 0, 1_000_000),
    reorderQuantity: reader.int("reorder_quantity", 1, 1_000_000),
    lendable: reader.bool("lendable"),
    consumable: reader.bool("consumable"),
    selfCheckout: reader.bool("self_checkout"),
    loanDays: reader.int("loan_days", 1, 365),
    depositMinor: reader.money("deposit"),
    tags,
  };
  if (row.consumable && row.tracking === "SERIALIZED") reader.fail("consumable", "can't be yes for a serialized item.");
  return row;
}

function parseLocation(reader: Reader): LocationRow {
  const kindText = reader.text("kind", 20)?.toUpperCase() ?? null;
  const kind = (kindText ?? "OTHER") as LocationKind;
  if (!(locationKinds as readonly string[]).includes(kind)) reader.fail("kind", `must be one of ${locationKinds.map((k) => k.toLowerCase()).join(", ")}.`);
  return {
    name: reader.text("name", 80, true) ?? "",
    code: reader.locationCode("code", true) ?? "",
    kind,
    parentCode: reader.locationCode("parent_code", false),
    description: reader.text("description", 500),
  };
}

/** Check one row's fields. Money is read in major units of `currency` and returned in minor units. */
export function parseRow<K extends ImportKind>(kind: K, record: Record<string, string>, currency: string): ParsedRow<K> {
  const reader = new Reader(record, currency);
  let data: RowData[ImportKind];
  switch (kind) {
    case "locations":
      data = parseLocation(reader);
      break;
    case "categories":
      data = { name: reader.text("name", 60, true) ?? "", parent: reader.text("parent", 60), description: reader.text("description", 300) };
      break;
    case "items":
      data = parseItem(reader, record);
      break;
    case "stock":
      data = { sku: reader.sku("sku", true) ?? "", locationCode: reader.locationCode("location_code", true) ?? "", quantity: reader.int("quantity", 1, 1_000_000, true) ?? 0, unitCostMinor: reader.money("unit_cost") };
      break;
    default:
      data = {
        sku: reader.sku("sku", true) ?? "",
        locationCode: reader.locationCode("location_code", true) ?? "",
        serialNumber: reader.text("serial_number", 80),
        purchaseCostMinor: reader.money("purchase_cost"),
        purchasedAt: reader.date("purchased_at"),
      };
  }
  return { data: reader.errors.length ? null : (data as RowData[K]), errors: reader.errors };
}
