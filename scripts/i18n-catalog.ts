import ts from 'typescript';

/** Parse actual dictionary literals, including unquoted keys and multiline text. */
export function readTranslationCatalog(source: string) {
  const ast = ts.createSourceFile('locale.ts', source, ts.ScriptTarget.Latest, true);
  const entries = new Map<string, string>();
  const duplicates: string[] = [];
  const unsupported: string[] = [];
  const syntaxErrors = (ast as ts.SourceFile & { parseDiagnostics: readonly ts.Diagnostic[] }).parseDiagnostics.map(diagnostic => ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'));
  for (const statement of ast.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    for (const declaration of statement.declarationList.declarations) {
      if (!declaration.initializer || !ts.isObjectLiteralExpression(declaration.initializer)) continue;
      for (const property of declaration.initializer.properties) {
        if (!ts.isPropertyAssignment(property)) { unsupported.push(property.getText(ast)); continue; }
        const name = property.name;
        const key = ts.isIdentifier(name) || ts.isStringLiteral(name) ? name.text : null;
        if (!key || !ts.isStringLiteralLike(property.initializer)) { unsupported.push(property.getText(ast)); continue; }
        if (entries.has(key)) duplicates.push(key);
        entries.set(key, property.initializer.text);
      }
    }
  }
  return { entries, duplicates, unsupported, syntaxErrors };
}
export function translationPlaceholders(value: string): string[] {
  return [...value.matchAll(/\{(\w+)\}/g)].map((match) => match[1]!).sort();
}
export function compareTranslationCatalogs(english: Map<string, string>, translated: Map<string, string>) {
  const missing = [...english.keys()].filter((key) => !translated.has(key));
  const orphan = [...translated.keys()].filter((key) => !english.has(key));
  const identical: string[] = [], placeholderErrors: string[] = [], empty: string[] = [];
  for (const [key, value] of translated) {
    const original = english.get(key);
    if (original === undefined) continue;
    if (original.trim() && !value.trim()) empty.push(key);
    if (original && original === value) identical.push(key);
    if (JSON.stringify(translationPlaceholders(original)) !== JSON.stringify(translationPlaceholders(value))) placeholderErrors.push(key);
  }
  return { missing, orphan, identical, placeholderErrors, empty };
}
export type UiTextCandidate = { file: string; line: number; kind: string; text: string };
/** Catch a reused label gaining placeholders without updating every call site. */
export function findMissingTranslationValues(source: string, file: string, english: Map<string, string>) {
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const errors: Array<{ file: string; line: number; key: string; missing: string[] }> = [];
  function check(node: ts.Node, key: string, values: ts.Expression | undefined) {
    const required = translationPlaceholders(english.get(key) ?? '');
    if (!required.length || (values && !ts.isObjectLiteralExpression(values))) return;
    if (values && ts.isObjectLiteralExpression(values) && values.properties.some(ts.isSpreadAssignment)) return;
    const supplied = values && ts.isObjectLiteralExpression(values) ? values.properties.flatMap(property =>
      ts.isPropertyAssignment(property) || ts.isShorthandPropertyAssignment(property)
        ? [property.name.getText(ast).replace(/^['"]|['"]$/g, '')] : []) : [];
    const missing = [...new Set(required.filter(name => !supplied.includes(name)))];
    if (missing.length) errors.push({ file, line: ast.getLineAndCharacterOfPosition(node.getStart()).line + 1, key, missing });
  }
  function visit(node: ts.Node) {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && ['t', 'translateUi', 'translateLocale'].includes(node.expression.text)) {
      const offset = node.expression.text === 'translateLocale' ? 1 : 0;
      const key = node.arguments[offset];
      if (key && ts.isStringLiteral(key)) check(node, key.text, node.arguments[offset + 1]);
    }
    if ((ts.isJsxSelfClosingElement(node) || ts.isJsxOpeningElement(node)) && node.tagName.getText(ast) === 'TranslatedText') {
      const attributes = node.attributes.properties.filter(ts.isJsxAttribute);
      const id = attributes.find(attribute => attribute.name.getText(ast) === 'id')?.initializer;
      const values = attributes.find(attribute => attribute.name.getText(ast) === 'values')?.initializer;
      if (id && ts.isStringLiteral(id)) check(node, id.text, values && ts.isJsxExpression(values) ? values.expression : undefined);
    }
    ts.forEachChild(node, visit);
  }
  visit(ast);
  return errors;
}
/** Conservative inventory: flags explicit interface copy, never rewrites source automatically. */
export function findUiTextCandidates(source: string, file: string): UiTextCandidate[] {
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const result: UiTextCandidate[] = [];
  const attributes = new Set(['title', 'placeholder', 'aria-label', 'alt', 'label', 'description', 'message', 'hint', 'emptyMessage']);
  const copyProperties = new Set(['title', 'label', 'description', 'hint', 'placeholder', 'subtitle', 'tooltip', 'emptyMessage']);
  const renderedExpression = (node: ts.Node): boolean => {
    const parent = node.parent;
    if (ts.isJsxExpression(parent)) return !ts.isJsxAttribute(parent.parent) || attributes.has(parent.parent.name.getText(ast));
    if (ts.isConditionalExpression(parent) && node !== parent.condition) return renderedExpression(parent);
    if (ts.isBinaryExpression(parent) && node === parent.right && [ts.SyntaxKind.BarBarToken, ts.SyntaxKind.QuestionQuestionToken, ts.SyntaxKind.AmpersandAmpersandToken].includes(parent.operatorToken.kind)) return renderedExpression(parent);
    if (ts.isParenthesizedExpression(parent)) return renderedExpression(parent);
    return false;
  };
  function add(node: ts.Node, text: string, kind: string) {
    const normalized = text.replace(/\s+/g, ' ').trim();
    if (!/[A-Za-z]{2}/.test(normalized.replace(/\{\w+\}/g, ''))) return;
    result.push({ file, line: ast.getLineAndCharacterOfPosition(node.getStart(ast)).line + 1, kind, text: normalized });
  }
  function visit(node: ts.Node) {
    if (ts.isJsxText(node)) add(node, node.text, 'jsx-text');
    if (ts.isJsxAttribute(node) && attributes.has(node.name.getText(ast)) && node.initializer && ts.isStringLiteral(node.initializer)) add(node, node.initializer.text, 'attribute');
    if (ts.isStringLiteralLike(node)) {
      const parent = node.parent;
      if (renderedExpression(node)) add(node, node.text, 'jsx-expression');
      if (ts.isCallExpression(parent) && /^(?:set\w*(?:Error|Message|Notice)|alert|confirm)$/.test(parent.expression.getText(ast))) add(node, node.text, 'feedback');
      if (ts.isNewExpression(parent) && /^(?:Error|TypeError|RangeError)$/.test(parent.expression.getText(ast))) add(node, node.text, 'error');
      if (ts.isPropertyAssignment(parent) && parent.initializer === node && copyProperties.has(parent.name.getText(ast).replace(/^['"]|['"]$/g, ''))) add(node, node.text, 'config-copy');
    }
    if (ts.isTemplateExpression(node) && renderedExpression(node)) {
      add(node, node.head.text + node.templateSpans.map((span, index) => `{value${index + 1}}${span.literal.text}`).join(''), 'jsx-template');
    }
    ts.forEachChild(node, visit);
  }
  visit(ast);
  return result;
}
