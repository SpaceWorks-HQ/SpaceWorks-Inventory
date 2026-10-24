import { describe, expect, it } from "vitest";
import { categorySchema, itemSchema, locationSchema, supplierSchema } from "@/lib/catalogue/schemas";

describe("catalogue schemas", () => {
  it("accept their own parsed output (actions validate, then services parse again)", () => {
    const item = itemSchema.parse({ name: "Drill", sku: "", description: "", categoryId: "" });
    expect(itemSchema.parse(item)).toEqual(item);
    const location = locationSchema.parse({ name: "Shelf", code: "s1", description: "" });
    expect(locationSchema.parse(location)).toEqual(location);
    const category = categorySchema.parse({ name: "Tools" });
    expect(categorySchema.parse(category)).toEqual(category);
    const supplier = supplierSchema.parse({ name: "Robu", email: "", website: "" });
    expect(supplierSchema.parse(supplier)).toEqual(supplier);
  });
});
