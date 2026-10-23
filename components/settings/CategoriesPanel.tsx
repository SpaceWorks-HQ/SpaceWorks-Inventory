"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { deleteCategoryAction } from "@/app/actions/settings";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { EmptyState, SectionHeading } from "@/components/ui/display";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { useToast } from "@/components/feedback/ToastProvider";
import { formatMoney } from "@/lib/format/money";
import { CategoryDialog, type CategoryRow } from "./CategoryDialog";
import { treeOrder } from "./taxonomyTree";

const RENTAL_WORD: Record<string, string> = { FREE: "free", PER_DAY: "per day", PER_WEEK: "per week", FLAT: "flat" };

function overrides(row: CategoryRow, currency: string): string {
  const parts: string[] = [];
  if (row.loanDays !== null) parts.push(`${row.loanDays} days`);
  if (row.depositMinor !== null) parts.push(`${formatMoney(row.depositMinor, currency)} deposit`);
  if (row.rentalMode === "FREE") parts.push("No rental");
  else if (row.rentalMode) parts.push(`${row.rentalMinor !== null ? formatMoney(row.rentalMinor, currency) : "Rental"} ${RENTAL_WORD[row.rentalMode]}`);
  if (row.lateFeePerDayMinor !== null) parts.push(`${formatMoney(row.lateFeePerDayMinor, currency)} late fee a day`);
  return parts.length > 0 ? parts.join(" · ") : "Space settings";
}

export function CategoriesPanel({ slug, categories, currency, minorDigits }: { slug: string; categories: CategoryRow[]; currency: string; minorDigits: number }) {
  const router = useRouter();
  const { showToast } = useToast();
  const [editing, setEditing] = useState<{ category: CategoryRow | null } | null>(null);
  const [deleting, setDeleting] = useState<CategoryRow | null>(null);
  const [pending, startTransition] = useTransition();
  const ordered = treeOrder(categories);
  const parents = ordered.map((row) => ({ id: row.id, label: `${"— ".repeat(row.depth)}${row.name}` }));

  return (
    <div className="flex flex-col gap-4">
      <SectionHeading
        title="Categories"
        description="Group items so members can browse and managers can report by category. Sub-categories sit inside a parent."
        action={<Button variant="primary" startIcon={<Plus />} onClick={() => setEditing({ category: null })}>Add category</Button>}
      />
      {ordered.length === 0 ? (
        <EmptyState title="No categories yet.">Add one, or import a spreadsheet of items with their categories.</EmptyState>
      ) : (
        <Table label="Categories">
          <THead>
            <tr><TH>Category</TH><TH>Items</TH><TH>Lending</TH><TH><span className="sr-only">Actions</span></TH></tr>
          </THead>
          <TBody>
            {ordered.map((row) => (
              <TR key={row.id}>
                <TD>
                  <span className="block font-semibold" style={{ paddingLeft: `${row.depth * 20}px` }}>
                    {row.depth > 0 ? <span aria-hidden className="mr-1.5 text-ink-muted">└</span> : null}
                    {row.name}
                  </span>
                  {row.description ? <span className="block text-caption text-ink-muted" style={{ paddingLeft: `${row.depth * 20}px` }}>{row.description}</span> : null}
                </TD>
                <TD className="tabular-nums">{row.items}</TD>
                <TD className="text-body-ui text-ink-secondary">{overrides(row, currency)}</TD>
                <TD className="whitespace-nowrap text-right">
                  <span className="inline-flex gap-1">
                    <Button size="sm" variant="ghost" onClick={() => setEditing({ category: row })} aria-label={`Edit ${row.name}`}>Edit</Button>
                    <Button size="sm" variant="dangerQuiet" onClick={() => setDeleting(row)} aria-label={`Delete ${row.name}`}>Delete</Button>
                  </span>
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}
      {editing ? (
        <CategoryDialog
          key={editing.category?.id ?? "new"}
          slug={slug}
          category={editing.category}
          parents={parents}
          currency={currency}
          minorDigits={minorDigits}
          open
          onClose={() => setEditing(null)}
        />
      ) : null}
      <ConfirmDialog
        open={deleting !== null}
        title={`Delete ${deleting?.name ?? "this category"}?`}
        message={deleting && deleting.items > 0 ? `Its ${deleting.items} items stay in the catalogue without a category.` : "No items use it."}
        confirmLabel="Delete category"
        loading={pending}
        onCancel={() => setDeleting(null)}
        onConfirm={() => {
          const target = deleting;
          if (!target) return;
          startTransition(async () => {
            const result = await deleteCategoryAction(slug, { id: target.id });
            setDeleting(null);
            if (!result.ok) showToast(result.error, "error");
            else {
              showToast("Category deleted.", "success");
              router.refresh();
            }
          });
        }}
      />
    </div>
  );
}
