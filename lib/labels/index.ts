import "server-only";

import type { Space } from "@prisma/client";
import { findLabelRows, type LabelQuery } from "./data";
import type { LabelSize } from "./layout";
import { renderLabelsPdf } from "./pdf";

/**
 * QR labels: the rows to print (`data.ts`), the A4 sheet grids
 * (`layout.ts`) and the PDF renderer (`pdf.ts`).
 */
export { LABEL_KINDS, findLabelRows, labelFilterOptions, labelQuerySchema, parseLabelSearchParams, type LabelKind, type LabelQuery, type LabelRow } from "./data";
export { LABEL_SIZES, MAX_LABELS, SHEETS, labelsPerPage, pageCount, type LabelSize } from "./layout";
export { renderLabelsPdf, type LabelData, type LabelOptions } from "./pdf";

/** The PDF for a space, using its label settings (size, name and location lines) unless a size is given. */
export async function printLabels(space: Pick<Space, "id" | "name" | "labelSize" | "labelShowName" | "labelShowLocation">, query: LabelQuery, size?: LabelSize | null) {
  const rows = await findLabelRows(space.id, query);
  if (rows.length === 0) return null;
  const pdf = await renderLabelsPdf(rows, {
    size: size ?? space.labelSize,
    showName: space.labelShowName,
    showLocation: space.labelShowLocation,
    title: `${space.name} labels`,
  });
  return { pdf, count: rows.length };
}
