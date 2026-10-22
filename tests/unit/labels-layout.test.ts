import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { A4, LABEL_SIZES, labelBox, labelParts, labelsPerPage, MM, pageCount, sheetFits, SHEETS } from "@/lib/labels/layout";
import { renderLabelsPdf } from "@/lib/labels/pdf";
import { fitSize, pathToWidth, truncateToWidth, wrapToWidth } from "@/lib/labels/text";

describe("label sheets", () => {
  it("fits the standard grids on A4", () => {
    expect(labelsPerPage("SMALL")).toBe(65);
    expect(labelsPerPage("MEDIUM")).toBe(21);
    expect(labelsPerPage("LARGE")).toBe(8);
    for (const size of LABEL_SIZES) expect(sheetFits(size), size).toBe(true);
  });

  it("paginates by labels per sheet", () => {
    expect(pageCount("MEDIUM", 0)).toBe(0);
    expect(pageCount("MEDIUM", 1)).toBe(1);
    expect(pageCount("MEDIUM", 21)).toBe(1);
    expect(pageCount("MEDIUM", 22)).toBe(2);
    expect(pageCount("SMALL", 500)).toBe(8);
    expect(pageCount("LARGE", 500)).toBe(63);
  });

  it("fills left to right, top to bottom, then the next page", () => {
    const first = labelBox("MEDIUM", 0);
    expect(first).toMatchObject({ page: 0, column: 0, row: 0 });
    expect(first.x).toBeCloseTo(SHEETS.MEDIUM.marginLeft * MM);
    expect(first.y + first.height).toBeCloseTo(A4.height - SHEETS.MEDIUM.marginTop * MM);
    expect(labelBox("MEDIUM", 2)).toMatchObject({ page: 0, column: 2, row: 0 });
    expect(labelBox("MEDIUM", 3)).toMatchObject({ page: 0, column: 0, row: 1 });
    expect(labelBox("MEDIUM", 3).y).toBeLessThan(first.y);
    const nextPage = labelBox("MEDIUM", 21);
    expect(nextPage).toMatchObject({ page: 1, column: 0, row: 0, x: first.x, y: first.y });
  });

  it("keeps every label, its QR and its text inside the page and the label", () => {
    for (const size of LABEL_SIZES) {
      for (let index = 0; index < labelsPerPage(size); index += 1) {
        const box = labelBox(size, index);
        expect(box.x).toBeGreaterThanOrEqual(0);
        expect(box.y).toBeGreaterThanOrEqual(0);
        expect(box.x + box.width).toBeLessThanOrEqual(A4.width);
        expect(box.y + box.height).toBeLessThanOrEqual(A4.height);
        const parts = labelParts(size, box);
        expect(parts.qr.x).toBeGreaterThan(box.x);
        expect(parts.qr.y).toBeGreaterThan(box.y);
        expect(parts.qr.y + parts.qr.size).toBeLessThan(box.y + box.height);
        expect(parts.text.width).toBeGreaterThan(10 * MM);
      }
    }
  });
});

describe("label text", () => {
  const measure = (text: string) => text.length;

  it("truncates with an ellipsis only when needed", () => {
    expect(truncateToWidth("Drill", 10, measure)).toBe("Drill");
    expect(truncateToWidth("Cordless drill, 18 V", 10, measure)).toBe("Cordless…");
    expect(truncateToWidth("Anything", 0, measure)).toBe("");
  });

  it("wraps by words and truncates the last line", () => {
    expect(wrapToWidth("Digital caliper 150 mm", 10, measure, 3)).toEqual(["Digital", "caliper", "150 mm"]);
    expect(wrapToWidth("Digital caliper 150 mm stainless", 10, measure, 2)).toEqual(["Digital", "caliper 1…"]);
    expect(wrapToWidth("Supercalifragilistic tool", 8, measure, 2)).toEqual(["Superca…", "tool"]);
  });
});

describe("label PDF", () => {
  it("renders A4 pages with one page per full sheet", async () => {
    const labels = Array.from({ length: 22 }, (_, index) => ({ qrCode: `I23456789ABCDEF${index % 10}`, code: `SKU-${index}`, name: `Item number ${index} with a long name`, location: "Main building › Workshop › Tool wall" }));
    const bytes = await renderLabelsPdf(labels, { size: "MEDIUM", showName: true, showLocation: true, baseUrl: "https://inventory.example.test" });
    expect(Buffer.from(bytes.slice(0, 5)).toString()).toBe("%PDF-");
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(2);
    expect(doc.getPage(0).getWidth()).toBeCloseTo(A4.width);
    expect(doc.getPage(0).getHeight()).toBeCloseTo(A4.height);
  });
});

describe("label text fitting", () => {
  const measure = (text: string) => text.length;
  it("keeps the specific end of a location path", () => {
    expect(pathToWidth("Main building › Lab › Shelf A", 40, measure)).toBe("Main building › Lab › Shelf A");
    expect(pathToWidth("Main building › Lab › Shelf A", 20, measure)).toBe("… › Lab › Shelf A");
    expect(pathToWidth("Main building › Lab › Shelf A", 7, measure)).toBe("Shelf A");
  });
  it("shrinks type to fit, down to a floor", () => {
    expect(fitSize("ABCDEFGHIJ", 50, 10, 7, (text, size) => text.length * size)).toBe(7);
    expect(fitSize("ABCD", 50, 10, 7, (text, size) => text.length * size)).toBe(10);
  });
});
