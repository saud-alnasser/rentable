// Pins the type layer of the package: the typeface ships in it, every size comes from the named
// scale in [[rules/frontend]] *Styling*, and no letter spacing reaches a reader's text.
//
// The size and tracking checks read source rather than rendered pages, because a class that
// never renders on the screen somebody happened to open is still a class somebody will render.
// `apps/desktop/src/lib/design/tests/typography.test.ts` holds the same two checks for the
// application; each package scans its own tree and neither reaches across.

import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { brotliDecompressSync } from 'node:zlib';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const LIB_ROOT = fileURLToPath(new URL('..', import.meta.url));
const SRC_ROOT = fileURLToPath(new URL('../..', import.meta.url));
const TOKENS = join(LIB_ROOT, 'tokens.css');

const SOURCE = /\.(svelte|ts|js|css|html)$/;

function toPosix(path: string) {
	return path.split(sep).join('/');
}

// every source file under `src/`, labelled from there. A `tests/` directory is left out: it
// covers these rules rather than obeying them, and this file names the very patterns it forbids.
function sourceFiles() {
	return readdirSync(SRC_ROOT, { recursive: true, withFileTypes: true })
		.filter((entry) => entry.isFile() && SOURCE.test(entry.name))
		.map((entry) => {
			const file = join(entry.parentPath, entry.name);
			return { file, label: toPosix(relative(SRC_ROOT, file)) };
		})
		.filter(({ label }) => !label.split('/').includes('tests'));
}

function occurrences(pattern: RegExp) {
	return sourceFiles().flatMap(({ file, label }) =>
		[...readFileSync(file, 'utf8').matchAll(pattern)].map((match) => ({ label, token: match[0] }))
	);
}

/**
 * Where letter spacing is allowed, and only because the text is a machine's rather than a
 * reader's: a keyboard shortcut is keys, never words, so it never renders Arabic. Anything else
 * with tracking would space out Arabic letters that are meant to join.
 */
const TRACKING_ALLOWED = [
	{ label: 'lib/primitive/command/command-shortcut.svelte', token: 'tracking-widest' },
	{ label: 'lib/primitive/context-menu/context-menu-shortcut.svelte', token: 'tracking-widest' },
	{ label: 'lib/primitive/dropdown-menu/dropdown-menu-shortcut.svelte', token: 'tracking-widest' },
	{ label: 'lib/primitive/menubar/menubar-shortcut.svelte', token: 'tracking-widest' }
];

describe('the typeface', () => {
	const tokens = readFileSync(TOKENS, 'utf8');
	const faces = [...tokens.matchAll(/@font-face\s*\{[^}]*\}/g)].map((match) => match[0]);

	it('is declared by the token layer', () => {
		assert.ok(faces.length > 0, 'tokens.css declares no @font-face');
	});

	it('names only files that exist in the package', () => {
		const urls = faces.flatMap((face) =>
			[...face.matchAll(/url\(\s*['"]?([^'")]+)['"]?\s*\)/g)].map((match) => match[1])
		);

		assert.ok(urls.length > 0, 'no @font-face names a file');
		for (const url of urls) {
			assert.doesNotMatch(url, /^(https?:)?\/\//, `${url} loads from a network`);
			assert.ok(existsSync(resolve(LIB_ROOT, url)), `${url} is named by tokens.css and missing`);
		}
	});

	it('ships its licence beside the files', () => {
		assert.ok(existsSync(join(LIB_ROOT, 'fonts', 'OFL.txt')));
	});

	it('blocks rather than swapping, since the files are local', () => {
		for (const face of faces) {
			assert.match(face, /font-display:\s*block/);
		}
	});

	it('is named first by the sans stack, with the system face after it', () => {
		assert.match(tokens, /--font-sans:\s*'Readex Pro',\s*system-ui\b/);
	});
});

// the WOFF2 known-table list, in the order its six-bit tag index counts through
// (https://www.w3.org/TR/WOFF2/#table_dir_format).
const KNOWN_TAGS = (
	'cmap head hhea hmtx maxp name OS/2 post cvt  fpgm glyf loca prep CFF  VORG EBDT EBLC gasp ' +
	'hdmx kern LTSH PCLT VDMX vhea vmtx BASE GDEF GPOS GSUB EBSC JSTF MATH CBDT CBLC COLR CPAL ' +
	'SVG  sbix acnt avar bdat bloc bsln cvar fdsc feat fmtx fvar gvar hsty just lcar mort morx ' +
	'opbd prop trak Zapf Silf Glat Gloc Feat Sill'
)
	.match(/.{4} ?/g)!
	.map((tag) => tag.slice(0, 4));

/**
 * One table out of a WOFF2 file, decompressed with the brotli Node already carries. Enough of the
 * format to reach a table stored untransformed, which every layout table is: only `glyf`,
 * `loca` and `hmtx` are ever transformed, and their lengths are still read so the tables after
 * them are found.
 */
function woff2Table(file: string, wanted: string) {
	const bytes = readFileSync(file);
	assert.equal(bytes.toString('latin1', 0, 4), 'wOF2', `${file} is not a WOFF2 file`);

	const count = bytes.readUInt16BE(12);
	const compressedLength = bytes.readUInt32BE(20);
	let at = 48;

	const base128 = () => {
		let value = 0;
		for (let i = 0; i < 5; i++) {
			const byte = bytes[at++];
			value = value * 128 + (byte & 0x7f);
			if (!(byte & 0x80)) return value;
		}
		throw new Error('an overlong UIntBase128');
	};

	const entries = [];
	for (let i = 0; i < count; i++) {
		const flags = bytes[at++];
		const index = flags & 0x3f;
		const tag = index === 0x3f ? bytes.toString('latin1', at, (at += 4)) : KNOWN_TAGS[index];
		const version = flags >> 6;
		const length = base128();
		const transformed = tag === 'glyf' || tag === 'loca' ? version !== 3 : version !== 0;
		entries.push({ tag, length: transformed ? base128() : length });
	}

	const data = brotliDecompressSync(bytes.subarray(at, at + compressedLength));
	let offset = 0;
	for (const entry of entries) {
		if (entry.tag === wanted) return data.subarray(offset, offset + entry.length);
		offset += entry.length;
	}
	return undefined;
}

/** The feature tags a GSUB table registers, and the lookup types each one runs. */
function gsubFeatures(gsub: Buffer) {
	const featureList = gsub.readUInt16BE(6);
	const lookupList = gsub.readUInt16BE(8);
	const features = new Map<string, number[]>();

	for (let i = 0; i < gsub.readUInt16BE(featureList); i++) {
		const record = featureList + 2 + i * 6;
		const tag = gsub.toString('latin1', record, record + 4);
		const feature = featureList + gsub.readUInt16BE(record + 4);
		const types = [];
		for (let j = 0; j < gsub.readUInt16BE(feature + 2); j++) {
			const lookup =
				lookupList + gsub.readUInt16BE(lookupList + 2 + gsub.readUInt16BE(feature + 4 + j * 2) * 2);
			types.push(gsub.readUInt16BE(lookup));
		}
		features.set(tag, [...(features.get(tag) ?? []), ...types]);
	}
	return features;
}

describe('the tabular figures', () => {
	// the one subset carrying the digits 0-9. Readex Pro ships none, so `patch-tnum.py` adds them,
	// and without it `tabular-nums` on a money or count cell has nothing to switch on.
	const latin = join(LIB_ROOT, 'fonts', 'readex-pro-latin.woff2');

	it('are a tnum feature the Latin subset carries', () => {
		const gsub = woff2Table(latin, 'GSUB');
		assert.ok(gsub, 'the Latin subset has no GSUB table');

		const tnum = gsubFeatures(gsub).get('tnum');
		assert.ok(tnum, 'the Latin subset has no tnum feature: run fonts/patch-tnum.py');
		assert.deepEqual(tnum, [1], 'tnum is one single substitution');
	});
});

describe('the type scale', () => {
	it('has no arbitrary text size anywhere in the package', () => {
		assert.deepEqual(
			occurrences(/\btext-\[[^\]]*\]/g),
			[],
			'use a size from the scale in [[rules/frontend]] *Styling*'
		);
	});

	it('puts letter spacing on machine strings alone', () => {
		const found = occurrences(/\btracking-[\w.[\]%-]+/g);

		for (const allowed of TRACKING_ALLOWED) {
			assert.ok(
				found.some(({ label, token }) => label === allowed.label && token === allowed.token),
				`allowlisted tracking no longer exists: ${allowed.label} ${allowed.token}`
			);
		}

		const offenders = found.filter(
			({ label, token }) =>
				!TRACKING_ALLOWED.some((allowed) => allowed.label === label && allowed.token === token)
		);

		assert.deepEqual(offenders, []);
	});
});
