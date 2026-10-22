/**
 * Label sheet geometry (pure). Every size prints on A4 in the grid of the
 * common self-adhesive sheets: SMALL 38.1 × 21.2 mm (65 per sheet, 5 × 13),
 * MEDIUM 63.5 × 38.1 mm (21 per sheet, 3 × 7) and LARGE 99.1 × 67.7 mm
 * (8 per sheet, 2 × 4). Positions are in PDF points with the origin at the
 * bottom-left of the page, which is what pdf-lib draws in.
 */
export type LabelSize = "SMALL" | "MEDIUM" | "LARGE";
export const LABEL_SIZES: readonly LabelSize[] = ["SMALL", "MEDIUM", "LARGE"];

export const MM = 72 / 25.4;
export const A4 = { width: 210 * MM, height: 297 * MM };
export const MAX_LABELS = 500;

export type Sheet = {
  /** Label size in millimetres. */
  width: number;
  height: number;
  columns: number;
  rows: number;
  /** Top-left label's offset from the page's top-left corner, in mm. */
  marginLeft: number;
  marginTop: number;
  /** Distance between the left (top) edges of neighbouring labels, in mm. */
  pitchX: number;
  pitchY: number;
};

export const SHEETS: Record<LabelSize, Sheet> = {
  SMALL: { width: 38.1, height: 21.2, columns: 5, rows: 13, marginLeft: 4.75, marginTop: 10.7, pitchX: 40.6, pitchY: 21.2 },
  MEDIUM: { width: 63.5, height: 38.1, columns: 3, rows: 7, marginLeft: 7.25, marginTop: 15.15, pitchX: 66.0, pitchY: 38.1 },
  LARGE: { width: 99.1, height: 67.7, columns: 2, rows: 4, marginLeft: 4.65, marginTop: 13.1, pitchX: 101.6, pitchY: 67.7 },
};

export function labelsPerPage(size: LabelSize): number {
  const sheet = SHEETS[size];
  return sheet.columns * sheet.rows;
}

export function pageCount(size: LabelSize, labels: number): number {
  return labels <= 0 ? 0 : Math.ceil(labels / labelsPerPage(size));
}

export type LabelBox = { page: number; column: number; row: number; x: number; y: number; width: number; height: number };

/** Where the `index`-th label (0-based) goes: filled left to right, top to bottom, page by page. */
export function labelBox(size: LabelSize, index: number): LabelBox {
  const sheet = SHEETS[size];
  const perPage = labelsPerPage(size);
  const page = Math.floor(index / perPage);
  const slot = index % perPage;
  const column = slot % sheet.columns;
  const row = Math.floor(slot / sheet.columns);
  const left = (sheet.marginLeft + column * sheet.pitchX) * MM;
  const top = (sheet.marginTop + row * sheet.pitchY) * MM;
  const height = sheet.height * MM;
  return { page, column, row, x: left, y: A4.height - top - height, width: sheet.width * MM, height };
}

/** Does the grid fit on the page? (Used by tests to guard the numbers above.) */
export function sheetFits(size: LabelSize): boolean {
  const s = SHEETS[size];
  const right = s.marginLeft + (s.columns - 1) * s.pitchX + s.width;
  const bottom = s.marginTop + (s.rows - 1) * s.pitchY + s.height;
  return right <= 210 + 1e-6 && bottom <= 297 + 1e-6 && s.pitchX >= s.width && s.pitchY >= s.height;
}

/** Type sizes (pt), inner padding (mm) and how many lines of name each size has room for. */
export const LABEL_TYPE: Record<LabelSize, { code: number; name: number; detail: number; padding: number; nameLines: number }> = {
  SMALL: { code: 7, name: 5.5, detail: 5, padding: 1.4, nameLines: 1 },
  MEDIUM: { code: 10, name: 8, detail: 6.5, padding: 2.5, nameLines: 2 },
  LARGE: { code: 15, name: 11, detail: 9, padding: 4, nameLines: 3 },
};

/**
 * Inside one label: the QR square on the left (as tall as the label allows,
 * at most 45% of its width) and the text column to its right.
 */
export function labelParts(size: LabelSize, box: { x: number; y: number; width: number; height: number }) {
  const pad = LABEL_TYPE[size].padding * MM;
  const qr = Math.min(box.height - 2 * pad, box.width * 0.45);
  const qrBox = { x: box.x + pad, y: box.y + (box.height - qr) / 2, size: qr };
  const textX = qrBox.x + qr + pad;
  return { qr: qrBox, text: { x: textX, top: box.y + box.height - pad, width: box.x + box.width - pad - textX, bottom: box.y + pad } };
}
