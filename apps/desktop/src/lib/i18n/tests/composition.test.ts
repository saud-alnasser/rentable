import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import ts from 'typescript';

// effort 840, requirement 8 and criterion 8: a feature's strings live with the feature, so adding
// one does not edit a shared locale file. Each concept's strings sit in its own
// `<concept>/i18n/<locale>.ts`, and `i18n/<locale>/index.ts` holds three things only: the imports
// of those pieces, the shared vocabulary no one concept owns, and the object composing both at
// the key paths the generated types name. This reads each index as a syntax tree and holds it to
// exactly that, so a concept's block written back into an index fails here, and so does shared
// vocabulary that grows without being named below.

/**
 * the key paths whose strings are written in the index itself, because every concept speaks them
 * rather than one: the verbs on controls, the nouns in headings and columns, the navigation, the
 * statuses a record shows, the generic chrome of the frame, and the words an error or a refusal
 * from the shell becomes. Everything else is a concept's, and is composed from its piece.
 */
const SHARED = [
	'app',
	'common.actions',
	'common.deleteDialog',
	'common.errors',
	'common.failures',
	'common.formats',
	'common.labels',
	'common.messages',
	'common.nav',
	'common.refusals.host',
	'common.refusals.record',
	'common.status',
	'common.statusDescriptions',
	'common.time',
	'common.ui'
];

const LOCALES = ['en', 'ar'] as const;

// a piece of one locale, as its index imports it: a relative path with the `.js` extension.
const PIECE = (locale: string) => new RegExp(`^\\.\\./\\.\\./(?:[a-z-]+/)+i18n/${locale}\\.js$`);

function parse(locale: string) {
	const file = fileURLToPath(new URL(`../${locale}/index.ts`, import.meta.url));
	return ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
}

/** the piece namespaces an index imports, after holding every statement to the three kinds. */
function pieces(source: ts.SourceFile, locale: string) {
	const names = new Set<string>();
	const strays: string[] = [];

	for (const statement of source.statements) {
		if (ts.isImportDeclaration(statement)) {
			const specifier = (statement.moduleSpecifier as ts.StringLiteral).text;
			const bindings = statement.importClause?.namedBindings;
			if (statement.importClause?.isTypeOnly) continue;
			if (bindings && ts.isNamespaceImport(bindings) && PIECE(locale).test(specifier)) {
				names.add(bindings.name.text);
				continue;
			}
		} else if (ts.isVariableStatement(statement)) {
			const [declaration] = statement.declarationList.declarations;
			const init = declaration?.initializer;
			if (
				statement.declarationList.declarations.length === 1 &&
				ts.isIdentifier(declaration.name) &&
				declaration.name.text === locale &&
				init &&
				ts.isSatisfiesExpression(init) &&
				ts.isObjectLiteralExpression(init.expression)
			) {
				continue;
			}
		} else if (
			ts.isExportAssignment(statement) &&
			ts.isIdentifier(statement.expression) &&
			statement.expression.text === locale
		) {
			continue;
		}
		strays.push(statement.getText(source).split('\n')[0]);
	}

	assert.deepEqual(strays, [], `i18n/${locale}/index.ts holds something besides the three kinds`);
	return names;
}

/** the composed object an index builds. */
function composed(source: ts.SourceFile) {
	for (const statement of source.statements) {
		if (!ts.isVariableStatement(statement)) continue;
		const init = statement.declarationList.declarations[0].initializer as ts.SatisfiesExpression;
		return init.expression as ts.ObjectLiteralExpression;
	}
	throw new Error('no composed object');
}

// the identifier a member expression reads from: `organization` in `organization.layout.signIn`.
function root(expression: ts.Expression): string | undefined {
	if (ts.isIdentifier(expression)) return expression.text;
	if (ts.isPropertyAccessExpression(expression)) return root(expression.expression);
	return undefined;
}

function keyOf(name: ts.PropertyName) {
	return ts.isIdentifier(name) || ts.isStringLiteral(name) ? name.text : name.getText();
}

/**
 * Every place the object departs from the rule, and the shared paths it writes strings at. A
 * string sits under a shared path; any other value is a nested object or reads a piece.
 */
function walk(object: ts.ObjectLiteralExpression, names: Set<string>, path: string[] = []) {
	const faults: string[] = [];
	const written = new Set<string>();
	const shared = (at: string[]) =>
		SHARED.find((prefix) => at.join('.') === prefix || at.join('.').startsWith(`${prefix}.`));

	for (const property of object.properties) {
		if (ts.isSpreadAssignment(property)) {
			const from = root(property.expression);
			if (from === undefined || !names.has(from))
				faults.push(`${path.join('.')}: a spread of no piece`);
			continue;
		}
		if (!ts.isPropertyAssignment(property)) {
			faults.push(`${path.join('.')}: ${property.getText()}`);
			continue;
		}

		const at = [...path, keyOf(property.name)];
		const value = property.initializer;
		if (ts.isStringLiteral(value) || ts.isNoSubstitutionTemplateLiteral(value)) {
			const prefix = shared(at);
			if (prefix) written.add(prefix);
			else faults.push(`${at.join('.')}: a string written in the index`);
		} else if (ts.isObjectLiteralExpression(value)) {
			const inner = walk(value, names, at);
			faults.push(...inner.faults);
			for (const prefix of inner.written) written.add(prefix);
		} else {
			const from = root(value);
			if (from === undefined || !names.has(from)) faults.push(`${at.join('.')}: reads no piece`);
		}
	}

	return { faults, written };
}

for (const locale of LOCALES) {
	test(`i18n/${locale}/index.ts holds only imports, shared vocabulary and the composed object`, () => {
		const source = parse(locale);
		const names = pieces(source, locale);
		const { faults, written } = walk(composed(source), names);

		assert.deepEqual(faults, [], 'a concept writes its strings in its own i18n piece');
		assert.deepEqual(
			[...written].sort(),
			[...SHARED].sort(),
			'the shared vocabulary written in the index is exactly the list above'
		);
	});
}
