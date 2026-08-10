#!/usr/bin/env node

/**
 * Regenerates every index the workflow generates, from the fields the indexed files
 * declare — so an index cannot disagree with the directory it indexes.
 *
 *   node .claude/scripts/regenerate-indexes.mjs [repo-root]
 *
 * `repo-root` defaults to the repository this script lives in. Four families are
 * produced: contexts, decisions, evidence, and designs.
 *
 * Exit 0 when every family was found and every index written. Exit 1 when a family's
 * directory is missing, or when a file is refused — a refusal writes nothing at all,
 * because a partly-regenerated set of indexes is worse than a stale one.
 */

import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { EOL } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const DEFAULT_ROOT = resolve(HERE, '..', '..');

class Refusal extends Error {}

function refuse(file, because) {
	throw new Refusal(`${file}: ${because}`);
}

/** Filename order, independent of locale — two runs must agree on every platform. */
function byName(a, b) {
	return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * The line ending the checkout uses. Comparison is against what git put on disk, so a
 * fixed ending would fail on every platform but the author's — and fail as a stale
 * index rather than as the disagreement it is.
 */
function checkoutEol(root) {
	const attributes = join(root, '.gitattributes');
	if (!existsSync(attributes)) return EOL;
	for (const line of readFileSync(attributes, 'utf8').split(/\r?\n/)) {
		const rule = line.trim();
		if (rule === '' || rule.startsWith('#')) continue;
		const [pattern, ...attrs] = rule.split(/\s+/);
		if (pattern !== '*') continue;
		if (attrs.includes('eol=lf')) return '\n';
		if (attrs.includes('eol=crlf')) return '\r\n';
	}
	return EOL;
}

/**
 * Frontmatter as declared fields. Two list shapes exist and they are not
 * interchangeable: inline `key: [a, b]`, and block — the key alone, then indented
 * `- entry` lines, which is what lets one entry contain a comma.
 */
function parseFrontmatter(file) {
	const lines = readFileSync(file, 'utf8').split(/\r?\n/);
	if (lines[0] !== '---') refuse(file, 'it declares no frontmatter');
	const end = lines.indexOf('---', 1);
	if (end === -1) refuse(file, 'its frontmatter is never closed');

	const fields = new Map();
	let open = null;
	for (const line of lines.slice(1, end)) {
		if (line.trim() === '') continue;

		const entry = /^\s+-\s+(.*)$/.exec(line);
		if (entry) {
			if (!open) refuse(file, `a list entry sits under no key: ${line.trim()}`);
			open.items.push(entry[1].trim());
			continue;
		}

		const pair = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(line);
		if (!pair) refuse(file, `frontmatter line is neither a key nor a list entry: ${line.trim()}`);
		const [, key, rest] = pair;

		if (rest === '') {
			open = { shape: 'block', items: [] };
			fields.set(key, open);
			continue;
		}

		open = null;
		if (rest.startsWith('[') && rest.endsWith(']')) {
			const inner = rest.slice(1, -1).trim();
			const items = inner === '' ? [] : inner.split(',').map((item) => item.trim());
			fields.set(key, { shape: 'inline', items });
		} else {
			fields.set(key, { shape: 'scalar', value: rest.trim() });
		}
	}
	return fields;
}

function scalar(fields, key, file) {
	const field = fields.get(key);
	if (!field) refuse(file, `it declares no \`${key}\``);
	if (field.shape !== 'scalar') refuse(file, `\`${key}\` is a list where a value was required`);
	return field.value;
}

/** `shape` is the list form this family declares. `[]` satisfies either. */
function list(fields, key, shape, file) {
	const field = fields.get(key);
	if (!field) refuse(file, `it declares no \`${key}\``);
	if (field.shape === 'scalar') refuse(file, `\`${key}\` is a value where a list was required`);
	if (field.shape === 'block' && field.items.length === 0)
		refuse(file, `\`${key}\` has nothing under it -- that is YAML null; write \`[]\` to point at nothing`);
	if (field.items.length > 0 && field.shape !== shape)
		refuse(file, `\`${key}\` is ${field.shape} where this family declares ${shape}`);
	return field.items;
}

/** A cell with nothing in it is an em dash — blank reads as a column nobody filled in. */
function paths(entries) {
	return entries.length === 0 ? '—' : entries.map((entry) => `\`${entry}\``).join(', ');
}

/**
 * Whether a finding's body carries a consumption mark naming what was healed — a
 * `Consumed:` line with something after it. A mark naming nothing reads as no mark.
 */
function consumed(file) {
	const lines = readFileSync(file, 'utf8').split(/\r?\n/);
	const end = lines[0] === '---' ? lines.indexOf('---', 1) : 0;
	for (const line of lines.slice(end + 1)) {
		const mark = /^Consumed:\s*(.*)$/.exec(line);
		if (mark) return mark[1].trim() !== '';
	}
	return false;
}

function markdownFiles(dir) {
	return readdirSync(dir, { withFileTypes: true })
		.filter((e) => e.isFile() && e.name.endsWith('.md') && e.name !== 'map.md')
		.map((e) => e.name)
		.sort(byName);
}

function subdirectories(dir) {
	return readdirSync(dir, { withFileTypes: true })
		.filter((e) => e.isDirectory())
		.map((e) => e.name)
		.sort(byName);
}

/**
 * Every index opens with `owner: repository` frontmatter: the generated files sit in a
 * corpus where every instruction and knowledge file declares its owner, and the
 * generator is the only writer here, so the declaration is emitted rather than asked.
 */
function table(title, columns, rows) {
	return [
		'---',
		'owner: repository',
		'---',
		'',
		`# ${title}`,
		'',
		`| ${columns.join(' | ')} |`,
		`| ${columns.map(() => '---').join(' | ')} |`,
		...rows,
	];
}

function buildContexts(root, errors) {
	const dir = join(root, '.claude', 'contexts');
	if (!existsSync(dir)) {
		errors.push('contexts: `.claude/contexts/` does not exist');
		return null;
	}

	const row = (label, link, file) => {
		const fields = parseFrontmatter(file);
		return `| [${label}](${link}) | ${scalar(fields, 'load-when', file)} | ${paths(list(fields, 'sources', 'inline', file))} |`;
	};

	// `repository.md` leads: it is the cross-cutting vocabulary rather than a domain.
	const flat = markdownFiles(dir);
	const ordered = [...flat.filter((n) => n === 'repository.md'), ...flat.filter((n) => n !== 'repository.md')];
	const rows = ordered.map((name) => row(name.slice(0, -3), name, join(dir, name)));

	for (const group of subdirectories(dir)) {
		const members = markdownFiles(join(dir, group));
		if (members.length === 0) continue;
		// Blank cells, not dashes: a directory has no frontmatter, so nobody was asked.
		rows.push(`| **${group}** | | |`);
		for (const name of members) {
			rows.push(row(`${group}/${name.slice(0, -3)}`, `${group}/${name}`, join(dir, group, name)));
		}
	}

	if (rows.length === 0) return null;
	return { path: join(dir, 'map.md'), lines: table('Context map', ['Context', 'Load when', 'Sources'], rows) };
}

function buildDecisions(root, errors) {
	const dir = join(root, '.claude', 'decisions');
	if (!existsSync(dir)) {
		errors.push('decisions: `.claude/decisions/` does not exist');
		return null;
	}

	const rows = markdownFiles(dir).map((name) => {
		const file = join(dir, name);
		const id = /^(\d{4})-/.exec(name);
		if (!id) refuse(file, 'its filename carries no four-digit id, which is the row link text and the sort key');
		const fields = parseFrontmatter(file);
		const loadWhen = scalar(fields, 'load-when', file);
		const status = scalar(fields, 'status', file);
		return `| [${id[1]}](${name}) | ${loadWhen} | ${status} | ${paths(list(fields, 'sources', 'inline', file))} |`;
	});

	if (rows.length === 0) return null;
	return { path: join(dir, 'map.md'), lines: table('Decision map', ['ADR', 'Load when', 'Status', 'Sources'], rows) };
}

function buildEvidence(root, errors) {
	const dir = join(root, '.claude', 'evidence');
	if (!existsSync(dir)) {
		errors.push('evidence: `.claude/evidence/` does not exist');
		return null;
	}

	const stray = markdownFiles(dir);
	if (stray.length > 0)
		refuse(join(dir, stray[0]), 'it sits directly under `evidence/`, where no kind directory can name its kind');

	// Filename order, which is date order, with the kind directory breaking a tie.
	const found = [];
	for (const kind of subdirectories(dir)) {
		for (const name of markdownFiles(join(dir, kind))) found.push({ kind, name });
	}
	found.sort((a, b) => byName(a.name, b.name) || byName(a.kind, b.kind));

	const rows = found.map(({ kind, name }) => {
		const file = join(dir, kind, name);
		const fields = parseFrontmatter(file);
		const declared = scalar(fields, 'kind', file);
		if (declared !== kind) refuse(file, `it declares kind \`${declared}\` but sits in \`${kind}/\``);
		const falsifies = list(fields, 'falsifies', 'inline', file);
		// A finding that named something to heal is `waiting` until its own consumption
		// mark says otherwise — the mark is where the file records its healing, and the
		// one value any index reads from outside the frontmatter. Unknown resolves to
		// waiting: the reverse would retire evidence nobody acted on.
		const cell =
			falsifies.length === 0 ? '—' : `${consumed(file) ? 'consumed' : 'waiting'} — ${paths(falsifies)}`;
		return `| [${name.slice(0, -3)}](${kind}/${name}) | ${kind} | ${cell} |`;
	});

	if (rows.length === 0) return null;
	return { path: join(dir, 'map.md'), lines: table('Evidence map', ['Finding', 'Kind', 'Falsifies'], rows) };
}

/**
 * Specs live either flat in the designs directory or one per effort beside the tickets
 * they govern. The two layouts are exclusive: preferring one would drop every row of
 * the other and report it as a stale index.
 */
function buildDesigns(root, errors) {
	const flatDir = join(root, '.claude', 'designs');
	const effortDir = join(root, '.claude', 'tickets');

	const flat = existsSync(flatDir) ? markdownFiles(flatDir) : [];
	const efforts = existsSync(effortDir)
		? subdirectories(effortDir).filter((effort) => existsSync(join(effortDir, effort, 'spec.md')))
		: [];

	if (flat.length > 0 && efforts.length > 0)
		refuse(effortDir, 'specs exist both flat under `.claude/designs/` and per effort here; the two layouts are exclusive');

	if (!existsSync(flatDir) && !existsSync(effortDir)) {
		errors.push('designs: neither `.claude/designs/` nor `.claude/tickets/` exists');
		return null;
	}

	const found =
		efforts.length > 0
			? efforts.map((effort) => ({ label: effort, link: `${effort}/spec.md`, file: join(effortDir, effort, 'spec.md') }))
			: flat.map((name) => ({ label: name.slice(0, -3), link: name, file: join(flatDir, name) }));

	const rows = found.map(({ label, link, file }) => {
		const fields = parseFrontmatter(file);
		const status = scalar(fields, 'status', file);
		return `| [${label}](${link}) | ${status} | ${paths(list(fields, 'sources', 'block', file))} |`;
	});

	if (rows.length === 0) return null;
	// One level above every spec under the effort layout, because it spans every effort.
	const path = efforts.length > 0 ? join(effortDir, 'map.md') : join(flatDir, 'map.md');
	return { path, lines: table('Design map', ['Design', 'Status', 'Sources'], rows) };
}

function main() {
	const root = resolve(process.argv[2] ?? DEFAULT_ROOT);
	const eol = checkoutEol(root);
	const errors = [];

	let indexes;
	try {
		indexes = [buildContexts, buildDecisions, buildEvidence, buildDesigns]
			.map((build) => build(root, errors))
			.filter(Boolean);
	} catch (error) {
		if (!(error instanceof Refusal)) throw error;
		// Emitted output stays ASCII: it crosses whatever console encoding the shell has,
		// and an em dash does not survive one that is not UTF-8.
		console.error(`refused, nothing written -- ${error.message}`);
		process.exit(1);
	}

	for (const { path, lines } of indexes) {
		writeFileSync(path, lines.join(eol) + eol, 'utf8');
		console.log(`wrote ${path} (${lines.length - 8} rows)`);
	}

	for (const error of errors) console.error(error);
	process.exit(errors.length === 0 ? 0 : 1);
}

main();
