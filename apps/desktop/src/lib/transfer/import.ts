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
 *
 * A third case sits between them and is why the two questions a column answers are kept apart.
 * **A file may be readable without being complete.** A directory's export is written for a
 * person to read: it carries the figures that were on the row and not the fields a record is
 * made of, so it can say which records it is about without being able to make one. Read back it
 * has to report, truthfully, that it would change nothing — which it can only do if the columns
 * a row is identified by are what decide whether the file can be read, and the columns a record
 * is built from decide only whether a row can be created.
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
	 *
	 * **A concept whose fields declare none has no identity at all**, and no two of its rows are
	 * ever the same record.
	 *
	 * `true` puts the column in the one identity every `true` column shares, which is a unit's
	 * complex and its name together. A string names a *group* of its own instead, checked apart
	 * from every other: a tenant's national id and its phone are each unique on their own, as the
	 * database holds them, so a row sharing either one with another row or with a held tenant is
	 * the same record whatever the other says.
	 */
	identity?: boolean | string;
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
	/**
	 * whether what is missing leaves the file unreadable as records of this concept at all.
	 *
	 * True only where a column a row is *identified* by is absent: without it nothing in the file
	 * can be matched against what is already here, so every row would read as new and a file
	 * imported twice would double the workspace. A column a row needs only in order to be
	 * *created* is a lesser fault — it is reported, the rows that would have needed it are turned
	 * away one at a time, and the rows this workspace already holds are still recognised. That is
	 * what lets a file written to be read by a person — a directory's export, which carries the
	 * columns that were on the row and not the ones a record is made of — still be read back and
	 * report, truthfully, that it would change nothing.
	 */
	isUnreadable: boolean;
};

/** What a concept says about its own file, beyond what its columns already say. */
export type ImportOptions = {
	/**
	 * whether two rows of one file may legitimately be the same record.
	 *
	 * False for almost everything, and left so: two tenants claiming one national id is a
	 * contradiction only the reader can settle, and the file is refused until they do. True for
	 * a payment — two of the same amount against the same contract on the same day are two
	 * payments, and refusing the second would refuse a file that is telling the truth.
	 *
	 * It says nothing about what is already held. A row matching a record the workspace has is
	 * still turned away whichever way this is set: that is the same file being read a second
	 * time, not a second payment being made.
	 */
	rowsMayRepeat?: boolean;
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

/**
 * The identity groups a concept's columns declare, each with its columns in declaration order.
 *
 * `true` is the group named by the empty string, so a sheet whose identity columns are all `true`
 * has one group and keys a row exactly as it did before groups existed.
 */
function identityGroups<TRecord>(fields: readonly ImportField<TRecord>[]) {
	const groups = new Map<string, ImportField<TRecord>[]>();

	for (const field of fields) {
		if (field.identity === undefined || field.identity === false) {
			continue;
		}

		const group = field.identity === true ? '' : field.identity;

		groups.set(group, [...(groups.get(group) ?? []), field]);
	}

	return groups;
}

/** the key one group's values are held under, its name leading so two groups never share one. */
function toGroupIdentity(group: string, values: readonly string[]) {
	return toImportIdentity(group === '' ? values : [group, ...values]);
}

/**
 * The keys a record the workspace holds is known under, one per identity group.
 *
 * `values` is the held name, which lists the identity columns' values in the order the fields
 * declare them. Built here rather than by the caller so a held record and a row of the file are
 * keyed by one function, for the reason {@link toImportIdentity} gives.
 */
export function toHeldIdentities<TRecord>(
	fields: readonly ImportField<TRecord>[],
	values: readonly string[]
): string[] {
	const groups = identityGroups(fields);

	// one group is the whole name, which is exactly the key a held record had before groups.
	if (groups.size <= 1) {
		const [group = ''] = groups.keys();

		return [toGroupIdentity(group, values)];
	}

	const positions = new Map(
		fields.filter((field) => field.identity).map((field, index) => [field, index])
	);

	return [...groups].map(([group, members]) =>
		toGroupIdentity(
			group,
			members.map((field) => values[positions.get(field)!] ?? '')
		)
	);
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
 * @param options what the concept says about its own file, beyond what its columns say.
 */
export function planImport<TRecord extends Record<string, string>>(
	fields: readonly ImportField<TRecord>[],
	table: { headers: string[]; rows: string[][] },
	validate: (record: TRecord) => string | undefined,
	existing: ReadonlySet<string> = new Set(),
	options: ImportOptions = {}
): ImportPlan<TRecord> {
	const headings = table.headers.map(comparable);
	const columnOf = new Map<string, number>();
	const missingColumns: string[] = [];
	let isUnreadable = false;

	for (const field of fields) {
		const index = headings.findIndex((heading) =>
			field.headers.some((candidate) => comparable(candidate) === heading)
		);

		if (index === -1) {
			// a column the file has to carry, either because a row is nothing without it or because
			// one row cannot be told from another without it.
			if (field.required || field.identity) {
				missingColumns.push(field.headers[0]);
			}

			// and only the second of those decides whether the file can be read at all.
			isUnreadable ||= Boolean(field.identity);

			continue;
		}

		columnOf.set(field.id, index);
	}

	if (isUnreadable) {
		return { create: [], rejected: [], collisions: [], missingColumns, isUnreadable };
	}

	const create: { row: number; record: TRecord }[] = [];
	const rejected: ImportRejection[] = [];
	// whether two rows can be the same record at all. A concept declaring no identity column has
	// no answer to "is this one already here?" — every row is its own record, and running the
	// checks below against an empty key would make the whole file one collision.
	const groups = [...identityGroups(fields)];
	const isIdentified = groups.length > 0;
	// where each identity was first seen, so a collision can name both rows rather than the
	// second one alone: the reader has to look at the pair to choose between them. Keyed per
	// group, and each carries the value a collision is named by.
	const seen = new Map<string, { rows: number[]; value: string }>();

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

		// one key per group, each with the value it is named by: the group's first column.
		const identities = groups.map(([group, members]) => {
			const values = members.map((field) => comparable(record[field.id]));

			return { key: toGroupIdentity(group, values), value: values[0] ?? '' };
		});

		// what is already here is answered before anything else about the row. A row naming a
		// record this workspace holds is not going to be created, so whether the rest of it is
		// complete or well-formed decides nothing — and asking the questions in the other order is
		// what made a file written for a person report every one of its rows as broken. Such a file
		// carries the columns that were on the row rather than the ones a record is made of, and
		// every row in it is already here.
		const held = identities.find((identity) => existing.has(identity.key));

		if (held) {
			rejected.push({ row, reason: 'duplicate-of-existing', detail: held.value });

			return;
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

		if (!isIdentified) {
			create.push({ row, record });

			return;
		}

		for (const identity of identities) {
			const first = seen.get(identity.key);

			seen.set(identity.key, {
				rows: [...(first?.rows ?? []), row],
				value: first?.value ?? identity.value
			});
		}

		create.push({ row, record });
	});

	const collisions = options.rowsMayRepeat
		? []
		: [...seen.values()]
				.filter(({ rows }) => rows.length > 1)
				.map(({ rows, value }) => ({ rows, identity: value }));

	return {
		create: collisions.length > 0 ? [] : create,
		rejected,
		collisions,
		missingColumns,
		isUnreadable
	};
}
