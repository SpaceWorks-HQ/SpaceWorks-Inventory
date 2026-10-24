import { moneyInputValue, parseMoneyInput } from "@/lib/format/quantity";

/** The item form as typed (strings), and its conversion to the `itemSchema` payload. Pure and client-safe. */
export type RentalModeValue = "" | "FREE" | "PER_DAY" | "PER_WEEK" | "FLAT";

export type ItemFormValues = {
  name: string; sku: string; description: string; categoryId: string; unitId: string; supplierId: string;
  tracking: "QUANTITY" | "SERIALIZED"; barcode: string; brand: string; model: string; tags: string;
  unitCost: string; reorderPoint: string; reorderQuantity: string;
  lendable: boolean; consumable: boolean; selfCheckout: boolean; requiresApproval: boolean;
  loanDays: string; replacement: string; deposit: string; rentalMode: RentalModeValue; rental: string; lateFee: string; notes: string;
};

export type ItemRecord = {
  name: string; sku: string; description: string | null; categoryId: string | null; unitId: string | null; supplierId: string | null;
  tracking: "QUANTITY" | "SERIALIZED"; barcode: string | null; brand: string | null; model: string | null; tags: string[];
  unitCostMinor: number; reorderPoint: number | null; reorderQuantity: number | null;
  lendable: boolean; consumable: boolean; selfCheckout: boolean; requiresApproval: boolean;
  loanDays: number | null; replacementMinor: number | null; depositMinor: number | null; rentalMode: Exclude<RentalModeValue, ""> | null;
  rentalMinor: number | null; lateFeePerDayMinor: number | null; notes: string | null;
};

export function emptyItemValues(): ItemFormValues {
  return {
    name: "", sku: "", description: "", categoryId: "", unitId: "", supplierId: "", tracking: "QUANTITY", barcode: "", brand: "", model: "", tags: "",
    unitCost: "", reorderPoint: "", reorderQuantity: "", lendable: false, consumable: false, selfCheckout: false, requiresApproval: true,
    loanDays: "", replacement: "", deposit: "", rentalMode: "", rental: "", lateFee: "", notes: "",
  };
}

const text = (value: number | null) => (value === null ? "" : String(value));

export function itemValuesFrom(item: ItemRecord, digits: number): ItemFormValues {
  return {
    name: item.name, sku: item.sku, description: item.description ?? "", categoryId: item.categoryId ?? "", unitId: item.unitId ?? "", supplierId: item.supplierId ?? "",
    tracking: item.tracking, barcode: item.barcode ?? "", brand: item.brand ?? "", model: item.model ?? "", tags: item.tags.join(", "),
    unitCost: item.unitCostMinor ? moneyInputValue(item.unitCostMinor, digits) : "", reorderPoint: text(item.reorderPoint), reorderQuantity: text(item.reorderQuantity),
    lendable: item.lendable, consumable: item.consumable, selfCheckout: item.selfCheckout, requiresApproval: item.requiresApproval,
    loanDays: text(item.loanDays), replacement: moneyInputValue(item.replacementMinor, digits), deposit: moneyInputValue(item.depositMinor, digits),
    rentalMode: item.rentalMode ?? "", rental: moneyInputValue(item.rentalMinor, digits), lateFee: moneyInputValue(item.lateFeePerDayMinor, digits), notes: item.notes ?? "",
  };
}

/** "pla, 3d printing, PLA" → ["pla", "3d printing"] (case-insensitive duplicates dropped). */
export function parseTags(value: string) {
  const seen = new Set<string>();
  const tags: string[] = [];
  for (const raw of value.split(",")) {
    const tag = raw.trim().slice(0, 32);
    if (tag && !seen.has(tag.toLowerCase())) {
      seen.add(tag.toLowerCase());
      tags.push(tag);
    }
  }
  return tags;
}

type Errors = Record<string, string>;

/** Convert the typed form to the server payload, or explain which fields need fixing. */
export function itemPayload(values: ItemFormValues, digits: number): { ok: true; payload: Record<string, unknown> } | { ok: false; errors: Errors } {
  const errors: Errors = {};
  const whole = (field: keyof ItemFormValues & string, value: string) => {
    if (!value.trim()) return null;
    if (!/^\d+$/.test(value.trim())) {
      errors[field] = "Use a whole number.";
      return null;
    }
    return Number(value.trim());
  };
  const money = (field: string, value: string) => {
    const minor = parseMoneyInput(value, digits);
    if (minor !== null && Number.isNaN(minor)) {
      errors[field] = digits > 0 ? "Enter an amount like 12.50." : "Enter a whole amount.";
      return null;
    }
    return minor;
  };
  if (!values.name.trim()) errors.name = "Enter a name.";
  const lending = values.lendable;
  const payload = {
    name: values.name.trim(), sku: values.sku.trim(), description: values.description, categoryId: values.categoryId, unitId: values.unitId, supplierId: values.supplierId,
    tracking: values.tracking, barcode: values.barcode, brand: values.brand, model: values.model, tags: parseTags(values.tags),
    unitCostMinor: money("unitCost", values.unitCost) ?? 0,
    reorderPoint: whole("reorderPoint", values.reorderPoint), reorderQuantity: whole("reorderQuantity", values.reorderQuantity),
    lendable: lending, consumable: values.tracking === "QUANTITY" && values.consumable,
    selfCheckout: lending && values.selfCheckout, requiresApproval: values.requiresApproval,
    loanDays: lending ? whole("loanDays", values.loanDays) : null,
    replacementMinor: money("replacement", values.replacement),
    depositMinor: lending ? money("deposit", values.deposit) : null,
    rentalMode: lending && values.rentalMode ? values.rentalMode : null,
    rentalMinor: lending && values.rentalMode && values.rentalMode !== "FREE" ? money("rental", values.rental) : null,
    lateFeePerDayMinor: lending ? money("lateFee", values.lateFee) : null,
    notes: values.notes,
  };
  return Object.keys(errors).length > 0 ? { ok: false, errors } : { ok: true, payload };
}
