import ts from "typescript";

// Extracted loaders can leave unused helpers and their type aliases behind.
// Drop declarations to a fixed point so their imports cannot retain backend code.
export function unusedRenderDeclarations(syntax) {
  const candidates = syntax.statements.filter(node =>
    (ts.isFunctionDeclaration(node) || ts.isTypeAliasDeclaration(node) || ts.isInterfaceDeclaration(node)) &&
    node.name && !node.modifiers?.some(modifier => modifier.kind === ts.SyntaxKind.ExportKeyword));
  const removed = new Set();
  let changed;
  do {
    changed = false;
    for (const declaration of candidates) {
      if (removed.has(declaration)) continue;
      const names = new Set();
      const visit = node => {
        if (ts.isIdentifier(node)) names.add(node.text);
        ts.forEachChild(node, visit);
      };
      syntax.statements.filter(node => node !== declaration && !removed.has(node) && !ts.isImportDeclaration(node)).forEach(visit);
      if (!names.has(declaration.name.text)) {
        removed.add(declaration);
        changed = true;
      }
    }
  } while (changed);
  return removed;
}
