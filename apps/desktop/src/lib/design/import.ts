import { foldSearchText } from '$lib/platform/database/search';

/**
 * IMPORT
 *
 * turning a table of text into records a concept can be asked to create, and deciding what is
 * wrong with it before anything is written.
 *
 * **Nothing here writes.** The whole point of the pass is that it happens first: a batch is
 * built before any of it runs and cannot branch on its own results ([[rules/data]], under
 * *Multi-table writes*), so a set that would half-apply has to be caught while it is still a
 * table of strings.
 *
 * Two kinds of wrong, and they are answered differently. **A row that is wrong on its own** —
 * a malformed phone number, a name that is missing, a national id another record already holds
 * — is rejected, named, and the rest of the file still goes in. **A file whose own rows collide
 * with each other** is refused entirely: the reader assembled that file, the two rows claiming
 * one identity are both theirs, and choosing between them is not something this can do quietly.
 */

/** One column an import reads, and what it is called in a file. */
export type ImportField<TRecord> = {
	/** what it is called in the record being built. */
	id: keyof TRecord & string;
	/**
	 * every heading that names this column, in every language the file may have been written in.
	 *
	 * More than one because a file exported from the Arabic interface carries Arabic headings and
	 * is still the same file. Matched folded and case-insensitively, through the comparison every
	 * search here uses.
	 */
	headers: readonly string[];
	/** whether a row without it is a row at all. */
	required?: boolean;
	/**
	 * the value this column contributes to the identity a file may not repeat.
	 *
	 * A column that names none takes no part in the collision check — two tenants may share a
	 * name, and only the identity columns decide whether a file is claiming one record twice.
	 */
	identity?: boolean;
};

/** Which row went wrong, and why. */
export type ImportRejection = {
	/** the row's place in the file, counting the heading as row one — which is what a reader sees. */
	row: number;
	reason: 'missing-column' | 'missing-value' | 'invalid' | 'duplicate-of-existing';
	/** the column or value at fault, where naming one helps. */
	detail: string;
};

/** Two rows of one file claiming the same record. */
export type ImportCollision = {
	/** the rows that collide, in the file's own numbering. */
	rows: number[];
	/** the identity they share. */
	identity: string;
};

/** What an import would do, worked out before it does any of it. */
export type ImportPlan<TRecord> = {
	create: { row: number; record: TRecord }[];
	rejected: ImportRejection[];
	/**
	 * the rows of this file that collide with each other.
	 *
	 * Where there are any, **nothing is created** — `create` is what would have been made had the
	 * file not contradicted itself, and it is reported so a reader can see what they nearly did.
	 */
	collisions: ImportCollision[];
	/** the headings the file was missing, which is a fault of the file rather than of a row. */
	missingColumns: string[];
};

/** Whether a plan may be carried out at all. */
export function isImportable<TRecord>(plan: ImportPlan<TRecord>) {
	return plan.missingColumns.length === 0 && plan.collisions.length === 0 && plan.create.length > 0;
}

/**
 * The key two records are the same record under.
 *
 * Encoded rather than joined by a separator: a separator is a character that must never appear
 * in a value, and there is no such character — the first attempt at this joined with one and
 * two different pairs could have produced one key. Both the caller holding the existing
 * identities and the pass checking against them build the key through here, so they cannot
 * disagree about what "the same record" means.
 */
export function toImportIdentity(values: readonly string[]) {
	return JSON.stringify(values.map((value) => comparable(value)));
}

/** the comparable form of a heading or an identity, so spelling does not decide a match. */
function comparable(value: string) {
	return foldSearchText(value.trim()).toLowerCase();
}

/**
 * Work out what a file would do.
 *
 * @param fields the columns this concept reads, in the order it wants them.
 * @param table the file, as the reader handed it over.
 * @param validate the concept's own rule for one record, answering the reason it is refused or
 * nothing where it is fine. The domain's, never restated here.
 * @param existing the identities already held, so a row that duplicates one is rejected rather
 * than failing at the write.
 */
export function planImport<TRecord extends Record<string, string>>(
	fields: readonly ImportField<TRecord>[],
	table: { headers: string[]; rows: string[][] },
	validate: (record: TRecord) => string | undefined,
	existing: ReadonlySet<string> = new Set()
): ImportPlan<TRecord> {
	const headings = table.headers.map(comparable);
	const columnOf = new Map<string, number>();
	const missingColumns: string[] = [];

	for (const field of fields) {
		const index = headings.findIndex((heading) =>
			field.headers.some((candidate) => comparable(candidate) === heading)
		);

		if (index === -1) {
			if (field.required) {
				missingColumns.push(field.headers[0]);
			}

			continue;
		}

		columnOf.set(field.id, index);
	}

	if (missingColumns.length > 0) {
		return { create: [], rejected: [], collisions: [], missingColumns };
	}

	const create: { row: number; record: TRecord }[] = [];
	const rejected: ImportRejection[] = [];
	// where each identity was first seen, so a collision can name both rows rather than the
	// second one alone — the reader has to look at the pair to choose between them.
	const seen = new Map<string, number[]>();

	table.rows.forEach((cells, index) => {
		// the heading is row one, so the first record is row two — which is what the reader is
		// looking at in whatever opened the file.
		const row = index + 2;
		const record = {} as TRecord;
		let missingValue: string | undefined;

		for (const field of fields) {
			const column = columnOf.get(field.id);
			const value = (column === undefined ? '' : (cells[column] ?? '')).trim();

			if (!value && field.required) {
				missingValue ??= field.headers[0];
			}

			record[field.id] = value as TRecord[typeof field.id];
		}

		if (missingValue) {
			rejected.push({ row, reason: 'missing-value', detail: missingValue });

			return;
		}

		const invalid = validate(record);

		if (invalid) {
			rejected.push({ row, reason: 'invalid', detail: invalid });

			return;
		}

		const identityValues = fields
			.filter((field) => field.identity)
			.map((field) => comparable(record[field.id]));
		const identity = toImportIdentity(identityValues);

		if (existing.has(identity)) {
			rejected.push({ row, reason: 'duplicate-of-existing', detail: identityValues[0] ?? '' });

			return;
		}

		seen.set(identity, [...(seen.get(identity) ?? []), row]);
		create.push({ row, record });
	});

	const collisions = [...seen.entries()]
		.filter(([, rows]) => rows.length > 1)
		.map(([identity, rows]) => ({ rows, identity: JSON.parse(identity)[0] ?? '' }));

	return {
		create: collisions.length > 0 ? [] : create,
		rejected,
		collisions,
		missingColumns
	};
}
