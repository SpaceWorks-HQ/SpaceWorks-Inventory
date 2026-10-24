import "server-only";

import { readFile } from "node:fs/promises";
import path from "node:path";
import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import QRCode from "qrcode";
import { qrUrl } from "@/lib/catalogue/qr";
import { A4, LABEL_TYPE, labelBox, labelParts, type LabelSize } from "./layout";
import { fitSize, pathToWidth, truncateToWidth, wrapToWidth } from "./text";

/** One label: the opaque QR value, the human code (asset tag, SKU, location or container code) and optional lines. */
export type LabelData = { qrCode: string; code: string; name: string | null; location: string | null };
export type LabelOptions = { size: LabelSize; showName: boolean; showLocation: boolean; title?: string; baseUrl?: string };

const INK = rgb(20 / 255, 44 / 255, 42 / 255);
const MUTED = rgb(91 / 255, 104 / 255, 99 / 255);
const BLACK = rgb(0, 0, 0);
const WHITE = rgb(1, 1, 1);
/** Light modules around the code so scanners find its edge (2 is enough on a white label). */
const QUIET_MODULES = 2;

let fontCache: Promise<{ bold: Uint8Array; medium: Uint8Array; regular: Uint8Array }> | null = null;

function brandFonts() {
  const dir = path.join(process.cwd(), "public", "brand", "fonts");
  fontCache ??= Promise.all(["Gilroy-SemiBold.woff", "Gilroy-Medium.woff", "Gilroy-Regular.woff"].map((file) => readFile(path.join(dir, file))))
    .then(([bold, medium, regular]) => ({ bold: bold!, medium: medium!, regular: regular! }))
    .catch((error) => {
      fontCache = null;
      throw error;
    });
  return fontCache;
}

/** Draw the QR as vector squares (one rectangle per horizontal run) on a white plate. */
function drawQr(page: PDFPage, value: string, box: { x: number; y: number; size: number }) {
  const { modules } = QRCode.create(value, { errorCorrectionLevel: "M" });
  const count = modules.size + QUIET_MODULES * 2;
  const unit = box.size / count;
  page.drawRectangle({ x: box.x, y: box.y, width: box.size, height: box.size, color: WHITE });
  for (let row = 0; row < modules.size; row += 1) {
    let start = -1;
    for (let col = 0; col <= modules.size; col += 1) {
      const dark = col < modules.size && modules.get(row, col) === 1;
      if (dark && start < 0) start = col;
      if (!dark && start >= 0) {
        page.drawRectangle({
          x: box.x + (start + QUIET_MODULES) * unit,
          y: box.y + box.size - (row + QUIET_MODULES + 1) * unit,
          width: (col - start) * unit,
          height: unit,
          color: BLACK,
        });
        start = -1;
      }
    }
  }
}

function drawLabel(page: PDFPage, fonts: { bold: PDFFont; medium: PDFFont; regular: PDFFont }, label: LabelData, options: LabelOptions, index: number) {
  const box = labelBox(options.size, index);
  const parts = labelParts(options.size, box);
  const type = LABEL_TYPE[options.size];
  drawQr(page, qrUrl(label.qrCode, options.baseUrl), parts.qr);

  const { x, width } = parts.text;
  let y = parts.text.top;
  const line = (text: string, font: PDFFont, size: number, color = INK) => {
    if (y - size < parts.text.bottom - 0.5) return;
    y -= size;
    page.drawText(text, { x, y, size, font, color });
    y -= size * 0.25;
  };
  const measure = (font: PDFFont, size: number) => (text: string) => font.widthOfTextAtSize(text, size);

  // The human code matters most: shrink it a little before cutting it.
  const codeSize = fitSize(label.code, width, type.code, type.code * 0.7, (text, size) => fonts.bold.widthOfTextAtSize(text, size));
  line(truncateToWidth(label.code, width, measure(fonts.bold, codeSize)), fonts.bold, codeSize);
  y -= type.name * 0.2;
  if (options.showName && label.name) {
    for (const text of wrapToWidth(label.name, width, measure(fonts.medium, type.name), type.nameLines)) line(text, fonts.medium, type.name);
  }
  if (options.showLocation && label.location) {
    const fits = measure(fonts.regular, type.detail);
    const lines = options.size === "SMALL" || fits(label.location) <= width ? [pathToWidth(label.location, width, fits)] : wrapToWidth(label.location, width, fits, 2);
    for (const text of lines) line(text, fonts.regular, type.detail, MUTED);
  }
}

/** Build a print-ready A4 PDF of labels in the sheet grid of `options.size`. Gilroy is embedded (subset). */
export async function renderLabelsPdf(labels: LabelData[], options: LabelOptions): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  doc.setTitle(options.title ?? "QR labels");
  doc.setCreator("Space Works Inventory");
  doc.setProducer("Space Works Inventory");
  const files = await brandFonts();
  const fonts = {
    bold: await doc.embedFont(files.bold, { subset: true }),
    medium: await doc.embedFont(files.medium, { subset: true }),
    regular: await doc.embedFont(files.regular, { subset: true }),
  };
  const pages: PDFPage[] = [];
  labels.forEach((label, index) => {
    const { page } = labelBox(options.size, index);
    while (pages.length <= page) pages.push(doc.addPage([A4.width, A4.height]));
    drawLabel(pages[page]!, fonts, label, options, index);
  });
  if (pages.length === 0) doc.addPage([A4.width, A4.height]);
  return doc.save();
}
