import ts from "typescript";
import { describe, expect, it } from "vitest";
import { unusedRenderDeclarations } from "../../scripts/frontend-render-declarations.mjs";

function removedNames(source: string) {
  const syntax = ts.createSourceFile("page.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  return [...unusedRenderDeclarations(syntax)].map(node => node.name.text);
}

describe("extracted frontend declarations", () => {
  it("removes loader helpers and their now-unused backend type references", () => {
    expect(removedNames(`
      import { listTokens } from "@/lib/apiTokens";
      type Token = Awaited<ReturnType<typeof listTokens>>[number];
      interface Row { token: Token }
      function keyRow(row: Row) { return row.token.name; }
      export default function Page() { return <p>Keys</p>; }
    `)).toEqual(["keyRow", "Row", "Token"]);
  });

  it("preserves helpers and types referenced by the renderer", () => {
    expect(removedNames(`
      type Label = string;
      interface Row { label: Label }
      function renderRow(row: Row) { return row.label; }
      export default function Page() { return <p>{renderRow({ label: "Keys" })}</p>; }
    `)).toEqual([]);
  });

  it("preserves exported declarations and top-level calls", () => {
    expect(removedNames(`
      export type Label = string;
      export interface Row { label: Label }
      export function label(row: Row) { return row.label; }
      function connect() { return database(); }
      connect();
    `)).toEqual([]);
  });
});
