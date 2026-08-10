#!/usr/bin/env node

/**
 * Reports where this clone stands — the Marker's two facts against the live two, the drift
 * lists when they differ, and an attestation that the reading happened.
 *
 *   node .claude/scripts/report-position.mjs [repo-root]
 *
 * `repo-root` defaults to the repository this script lives in.
 *
 * This emits the *position* half of the verification report and never the judgement half:
 * which contexts the work routes to, whether a Source Pointer still resolves, and whether a
 * Context statement is contradicted by source are the stage's own, and no script can produce
 * them. The stage prints its half beneath this output.
 *
 * Exit 0 always, including the three refusals — a refusal is a computed position whose
 * answer is *unverified*, not an error, and a clone with no Marker must still be able to
 * commit.
 */

import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { EOL, tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const DEFAULT_ROOT = resolve(HERE, '..', '..');

const MARKER = join('.claude', 'position', 'marker.json');
const RECEIPT = join('.claude', 'position', 'receipt.json');

/**
 * The line ending the checkout uses, read the same way its sibling script reads it. A fixed
 * ending fails on every platform but the author's, and fails as stale output rather than as
 * the disagreement it is.
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

function git(args, root, env = process.env) {
	return execFileSync('git', args, {
		cwd: root,
		env,
		encoding: 'utf8',
		stdio: ['ignore', 'pipe', 'pipe']
	});
}

/** Exit status as the answer, for the two questions asked that way. */
function gitSucceeds(args, root) {
	try {
		execFileSync('git', args, { cwd: root, stdio: 'ignore' });
		return true;
	} catch {
		return false;
	}
}

function gitLines(args, root) {
	return git(args, root)
		.split(/\r?\n/)
		.filter((line) => line !== '');
}

/**
 * The tree fingerprint: a git tree object built through a throwaway index seeded from the
 * repository's own.
 *
 * The seeding is not an optimisation. A fresh index carries no stat cache, so `git add -A`
 * re-hashes every file in the worktree on every stage; seeded, only genuinely changed files
 * are re-hashed. The real index is never written — the copy is what `GIT_INDEX_FILE` points
 * at. `git add -A` honours the ignore rules, which is what keeps the position directory out
 * of the fingerprint that this run is about to write a receipt into.
 */
function fingerprint(root) {
	const index = git(['rev-parse', '--path-format=absolute', '--git-path', 'index'], root).trim();
	const scratch = join(tmpdir(), `aep-position-${randomUUID()}`);
	if (existsSync(index)) copyFileSync(index, scratch);
	try {
		const env = { ...process.env, GIT_INDEX_FILE: scratch };
		git(['add', '-A'], root, env);
		return git(['write-tree'], root, env).trim();
	} finally {
		rmSync(scratch, { force: true });
	}
}

/** The Marker file has one home; read it fresh from there, never from memory. */
function readMarker(root) {
	const path = join(root, MARKER);
	if (!existsSync(path)) return null;
	return JSON.parse(readFileSync(path, 'utf8'));
}

/**
 * Committed drift, excluding the knowledge paths — a commit that only edited
 * `.claude/contexts/` is not drift in the Codebase, and counting it re-verifies Context
 * against its own edits. Two dots, not three: three would fold the Marker's own side back in.
 */
function committedDrift(marker, root) {
	return gitLines(['diff', '--name-only', `${marker}..HEAD`, '--', '.', ':(exclude).claude/'], root);
}

/**
 * Uncommitted drift. Each porcelain line is `XY<space><path>`, so the path starts at column
 * four — splitting on the first space mis-reads ` M` as a one-character status. A rename's
 * path field is `old -> new`, and the destination is what changed.
 */
function uncommittedDrift(root) {
	return gitLines(['status', '--porcelain', '--untracked-files=all'], root).map((line) => {
		const path = line.slice(3);
		const renamed = path.split(' -> ');
		return renamed[renamed.length - 1];
	});
}

const abbreviate = (name) => name.slice(0, 7);

/** Two spaces of indent, the label in a six-wide field, two spaces, then the columns. */
const field = (label, columns) => `  ${label.padEnd(6)}  ${columns}`;

/** Paths sit at twelve spaces, and are never truncated — a capped list hides the one that mattered. */
const at = (paths) => paths.map((path) => `            ${path}`);

function report(root) {
	const identity = process.env.CLAUDE_CODE_SESSION_ID ?? null;
	const mode = identity ? 'session' : 'commit-only';
	const modeLine = field('mode', identity ? `session ${identity}` : 'commit-only (run identity unavailable)');

	const head = git(['rev-parse', 'HEAD'], root).trim();
	const live = fingerprint(root);
	const receipt = { run: identity, mode, head, tree: live };

	const marker = readMarker(root);

	if (marker === null) {
		return {
			receipt,
			lines: [
				'Position',
				field('marker', 'absent'),
				'  -> nothing was verified in this clone; everything the request touches is unverified',
				modeLine
			]
		};
	}

	const at7 = abbreviate(marker.commit);

	if (!gitSucceeds(['cat-file', '-e', `${marker.commit}^{commit}`], root)) {
		return {
			receipt,
			lines: [
				'Position',
				field('marker', `${at7}  gone from this clone`),
				'  -> no diff is possible from it; everything the request touches is unverified',
				modeLine
			]
		};
	}

	if (!gitSucceeds(['merge-base', '--is-ancestor', marker.commit, 'HEAD'], root)) {
		return {
			receipt,
			lines: [
				'Position',
				field('marker', `${at7}  HEAD ${abbreviate(head)}   not an ancestor`),
				'  -> the diff between them is meaningless; everything the request touches is unverified',
				modeLine
			]
		};
	}

	const commitMatches = marker.commit === head;
	const commitVerdict = commitMatches
		? 'commit match'
		: `${git(['rev-list', '--count', `${marker.commit}..HEAD`], root).trim()} commits ahead`;

	// A Marker carrying no tree fact takes the differing branch. Unknown resolving to *read
	// it* is the safe direction; the reverse skips a read on the strength of a fact nobody
	// recorded.
	const treeMatches = marker.tree === live;

	const lines = [
		'Position',
		field('marker', `${at7}  HEAD ${abbreviate(head)}   ${commitVerdict}`),
		field(
			'tree',
			`${marker.tree ? abbreviate(marker.tree) : 'unknown'}  live ${abbreviate(live)}   ${
				treeMatches ? 'tree match' : 'tree differs'
			}`
		)
	];

	// The drift reads are what a match on both licenses skipping, and skipping them is the
	// entire point. The fingerprint above is not conditional — the tree verdict is what the
	// condition is read from.
	if (commitMatches && treeMatches) {
		lines.push(field('drift', 'reads skipped'));
	} else {
		const committed = committedDrift(marker.commit, root);
		const uncommitted = uncommittedDrift(root);
		lines.push(field('drift', `${committed.length} committed, ${uncommitted.length} uncommitted`));
		lines.push(...at(committed), ...at(uncommitted));
	}

	lines.push(modeLine);
	return { receipt, lines };
}

function main() {
	const root = resolve(process.argv[2] ?? DEFAULT_ROOT);
	const eol = checkoutEol(root);
	const { receipt, lines } = report(root);

	// Written on every run, including all three refusals: `head` and `tree` are what was
	// observed rather than what the Marker claimed, which is what lets the commit stage ask
	// whether a receipt attests *this* position. A clone whose Marker was never written has
	// no position directory either, and it must still be able to attest a reading.
	const path = join(root, RECEIPT);
	mkdirSync(dirname(path), { recursive: true });
	writeFileSync(path, JSON.stringify(receipt, null, 2).split('\n').join(eol) + eol);

	process.stdout.write(lines.join(eol) + eol);
}

main();
