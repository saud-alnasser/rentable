import type { Contributed } from '$lib/api/contribution';
import type { Database } from '$lib/api/context';
import type { RefusalCode } from '$lib/api/refusal';
import type { features } from '$lib/app/features';
import type { ExportSheet, ImportTable } from '$lib/platform/host';
import { toExportSheet, type ExportColumn } from '@rentable/design/csv.js';
import type { Flag } from '@rentable/workspace-permission';
import type { ZodType } from 'zod';
import { planImport, type ImportCollision, type ImportField, type ImportRejection } from './import';
import { toTransferKey } from './reference';

/**
 * WORKSPACE TRANSFER
 *
 * a whole workspace as one file, and one file back into a workspace.
 *
 * A directory can hand over its own records. A workspace could not hand over itself: a tenant
 * moving to another machine, or an operator handing a workspace on, needed five exports and
 * five imports made in exactly the right order, and any slip left the second machine holding
 * contracts whose tenants were missing.
 *
 * **One workbook, a sheet per concept, and each concept declares its own.** A record feature
 * hands the transfer its sheet in its `feature.ts`: what the tab is called, its columns, where it
 * stands, how a row of it is read and how its records are written. The composition root hands
 * this the list, and nothing here names a concept. The tabs are ordered as the writes have to
 * run, which is each sheet's `order`: a unit after the complex holding it, a payment after its
 * contract.
 *
 * **A sheet names another record the way a person would** (`reference.ts`), and a row naming a
 * record says which sheet it is of, so the pass can resolve it without knowing what either is.
 *
 * **Nothing here writes, and nothing here is derived.** The whole resolution happens in the
 * planning pass, against the file and the workspace at once, because a batch is built before
 * any of it runs and cannot branch on its own results ([[rules/data]], under *Multi-table
 * writes*). A reference that cannot be resolved drops the row that made it, and in a file
 * carrying several sheets it refuses the file whole as well: the row it named is what another
 * row exists for, and importing the half that resolved would build a workspace the file never
 * described.
 *
 * **A directory reads one sheet of the same file.** Importing into the units directory is this
 * pass scoped to units — the same columns, the same identities, the same resolution against the
 * workspace and against what the file itself creates. It is one declaration rather than five,
 * which is the duplication a per-directory import would otherwise have arrived at: a file of
 * units states its complex by name whether it came out of a workspace or out of a list, and two
 * places deciding what that name means is two places for them to disagree.
 *
 * **The file's headings are written in English and read in both languages.** A directory's
 * export is a document for a person and is written in the language they are reading in (#523).
 * A workspace transfer is a handover between two installations, which may not be set to the
 * same language — a file whose column names changed with the exporter's locale would be a file
 * the importer could not recognise. So it is written one way and matched against both.
 */

/**
 * What the workspace holds of one record, by the names a file uses: one name, or the several it
 * is keyed under (a unit is its complex and its own name).
 */
export type HeldName = string | string[];

/** A name one row gives a record of another sheet, which has to resolve before the row is kept. */
export type Reference = {
	/** the sheet whose records it names. */
	concept: string;
	/** what it is keyed under there. */
	values: readonly string[];
	/** what the row wrote, which is what an unresolved reference says back. */
	reference: string;
};

/** One statement of the batch an import is written in. */
export type Statement = Parameters<Database['batch']>[0][number];

/** What a sheet's writer is handed, for the one write every sheet takes part in. */
export type Writing = {
	db: Database;
	now: number;
	/** a record this write creates, which a later row may name by `values` from here on. */
	name(values: readonly string[], id: string): void;
	/**
	 * The id a name stands for, or a refusal naming what could not be found.
	 *
	 * **What a name is keyed under is not always the name.** A tenant, a complex and a contract are
	 * each one value, and a unit is two, which is how the planning pass keys one and therefore how
	 * this has to. `values` is that key; `name` stays what a person wrote, because it is what the
	 * refusal has to say back to them.
	 */
	resolve(concept: string, name: string, values?: readonly string[]): string;
};

/** What a sheet's writer hands back: its statements, how many records, and what it touched. */
export type Written = {
	statements: Statement[];
	count: number;
	/** the ids a settling pass is scoped to, by what they are, merged across every sheet. */
	touched?: Record<string, readonly string[]>;
};

/**
 * ONE SHEET
 *
 * what a record feature declares about its records in a workspace file. One declaration, read by
 * both directions, so a column cannot be written under one name and looked for under another.
 *
 * @template C the key its records sit under, in the file and in every transfer procedure.
 * @template TRecord a record as the file holds it.
 * @template TRow a row of its sheet, as text, before any of it is a record.
 * @template TInput what the write is asked to store of one record.
 */
export type Sheet<C extends string, TRecord, TRow extends Record<string, string>, TInput> = {
	concept: C;
	/** where it stands: its tab in the workbook, and its turn in the write. */
	order: number;
	/** what its tab is called in a file this writes, and every spelling the reader accepts. */
	names: { written: string; accepted: readonly string[] };
	/** the flag that lets a member see its records, which is what the held names answer to. */
	view: Flag;
	/**
	 * The columns it is written with.
	 *
	 * Declared beside the fields that read them back, and in the same order: a column added to one
	 * and not the other is what makes a file this application wrote a file it cannot read.
	 */
	columns: readonly ExportColumn<TRecord>[];
	/** every record the workspace holds, in the shape and the order the file holds them. */
	read(db: Database): Promise<TRecord[]>;
	/**
	 * What the workspace already holds, by the names a file uses: the identity a row repeating one
	 * is turned away under.
	 */
	held(db: Database): Promise<HeldName[]>;
	/** the columns a row is read from. */
	fields: readonly ImportField<TRow>[];
	/** whether two rows of one file may be the same record (`ImportOptions`). */
	rowsMayRepeat?: boolean;
	/** the concept's own rule for one row: the value it refuses it for, or nothing. None, where absent. */
	validate?(row: TRow, now: number): string | undefined;
	/** the records a row names, each of which has to resolve for the row to be kept. */
	references?(row: TRow): Reference[];
	/** the record a row that survived is. */
	toRecord(row: TRow): TRecord;
	/**
	 * What its records answer to when another sheet names one. Absent on a sheet nothing names.
	 */
	answers?: {
		/** the key a held record answers to; its held names, where this is left out. */
		held?(name: HeldName): readonly string[];
		/** the key a record the file creates answers to. */
		record(record: TRecord): readonly string[];
		/** the refusal for a name the file refers to and nothing answers. */
		unknown: RefusalCode;
		/** the id each held record answers under, by its key. */
		ids(db: Database): Promise<Iterable<readonly [readonly string[], string]>>;
	};
	/** what one record asks the write to store; the record itself, where this is left out. */
	toInput?(record: TRecord): TInput;
	/** the one record the write accepts. */
	input: ZodType<TInput>;
	/** its records' statements, in its turn of the one batch. */
	write(records: TInput[], writing: Writing): Promise<Written>;
	/**
	 * what runs once the batch has landed, over everything any sheet touched. Handed the procedure's
	 * database and what the features contribute, which a settlement may read through.
	 */
	settle?(
		ctx: { db: Database } & Contributed,
		now: number,
		touched: Record<string, readonly string[]>
	): Promise<void>;
};

/** Declare a sheet, keeping its concept as a literal and its records as their own type. */
export const defineSheet = <
	const C extends string,
	TRecord,
	TRow extends Record<string, string>,
	TInput
>(
	sheet: Sheet<C, TRecord, TRow, TInput>
) => sheet;

/**
 * Any sheet, whatever its records are: what the transfer reads off one without knowing its
 * concept. A record is read in, never out, where it is a parameter, so those take `never`.
 */
export type AnySheet = {
	concept: string;
	order: number;
	names: { written: string; accepted: readonly string[] };
	view: Flag;
	columns: readonly ExportColumn<never>[];
	read(db: Database): Promise<unknown[]>;
	held(db: Database): Promise<HeldName[]>;
	fields: readonly ImportField<never>[];
	rowsMayRepeat?: boolean;
	validate?(row: never, now: number): string | undefined;
	references?(row: never): Reference[];
	toRecord(row: never): unknown;
	answers?: {
		held?(name: HeldName): readonly string[];
		record(record: never): readonly string[];
		unknown: RefusalCode;
		ids(db: Database): Promise<Iterable<readonly [readonly string[], string]>>;
	};
	toInput?(record: never): unknown;
	input: ZodType;
	write(records: never[], writing: Writing): Promise<Written>;
	settle?(
		ctx: { db: Database } & Contributed,
		now: number,
		touched: Record<string, readonly string[]>
	): Promise<void>;
};

/** What a feature hands the transfer: its sheets, a unit's beside its complex's. */
export type Transfer = readonly AnySheet[];

/** The sheets a list of features declares; a feature declaring none adds none. */
export type SheetsOf<F extends readonly object[]> = F[number] extends infer Each
	? Each extends { transfer: infer Declared extends Transfer }
		? Declared[number]
		: never
	: never;

/** A feature as the transfer reads it: whatever else it declares, perhaps its sheets. */
type Declaring = { transfer?: Transfer };

type RecordOf<S> = S extends { read(db: Database): Promise<(infer R)[]> } ? R : never;
type InputOf<S> = S extends { input: ZodType<infer I> } ? I : never;

/** A whole workspace as a file holds it, one list of records per sheet. */
export type FileOf<S extends AnySheet> = { [K in S as K['concept']]: RecordOf<K>[] };
/** What a whole workspace asks the write to store, one list per sheet. */
export type InputFileOf<S extends AnySheet> = { [K in S as K['concept']]: InputOf<K>[] };
/** What the workspace holds, by the names a file uses, one list per sheet. */
export type HeldOf<S extends AnySheet> = { [K in S as K['concept']]: HeldName[] };
/** How many records a write stored, per sheet. */
export type CountOf<S extends AnySheet> = { [K in S as K['concept']]: number };

/** The sheets the application declares. */
type Sheets = SheetsOf<typeof features>;

/** The sheets a workspace is made of, by the key each one's records sit under. */
export type TransferConcept = Sheets['concept'];

/** A whole workspace, as a file holds it. */
export type WorkspaceTransfer = FileOf<Sheets>;

/** What a transfer asks the workspace to write. */
export type TransferInput = InputFileOf<Sheets>;

/**
 * What the workspace already holds, by the same names the file uses.
 *
 * Values rather than rows, and in the shape the identity is built from: a tenant is a national
 * id and a phone number together, a unit is its complex and its own name. Read as a set rather
 * than checked row by row, for the reason the tenant import already records — a file of five
 * hundred rows would otherwise be five hundred round trips before one of them is written.
 */
export type WorkspaceHeld = HeldOf<Sheets>;

/** Every sheet the features declare, in the order they are written and read. */
export function sheetsOf(declaring: readonly object[]): AnySheet[] {
	return (declaring as readonly Declaring[])
		.flatMap((feature) => feature.transfer ?? [])
		.sort((a, b) => a.order - b.order);
}

/**
 * **The sheets are bound in, never imported.** Every sheet is a feature's, and this capability
 * sits below the features, so it knows them only as the composition root hands them over:
 * `$lib/app/transfer` binds them once, as the root layout loads, as `$lib/app/caller` binds the
 * root router. The router is handed the same list where `app/features.ts` builds it.
 */
let bound: AnySheet[] | null = null;

/** Bind the sheets every feature declares. Called once, by `$lib/app/transfer`. */
export function bindTransfer(declaring: readonly object[]) {
	bound = sheetsOf(declaring);
}

function sheets(): AnySheet[] {
	if (bound === null) {
		throw new Error(
			'a workspace file was read before its sheets were bound: import `$lib/app/transfer` first'
		);
	}

	return bound;
}

/** the sheet whose records sit under a key. */
function sheetOf(concept: string) {
	const sheet = sheets().find((each) => each.concept === concept);

	if (!sheet) {
		throw new Error(`no feature declares the ${concept} sheet`);
	}

	return sheet;
}

/** The concepts a workspace is made of, in the order they have to be written. */
export function transferConcepts(): TransferConcept[] {
	return sheets().map((sheet) => sheet.concept as TransferConcept);
}

/** One list per sheet, each as `fill` makes it. */
function perSheet<T>(fill: (sheet: AnySheet) => T): Record<string, T> {
	return Object.fromEntries(sheets().map((sheet) => [sheet.concept, fill(sheet)]));
}

/** an empty one, which is what a plan starts from and what a refused file stays at. */
export function emptyTransfer(): WorkspaceTransfer {
	return perSheet(() => []) as unknown as WorkspaceTransfer;
}

/** nothing held, which is the workspace a transfer is designed to be read into. */
export function emptyHeld(): WorkspaceHeld {
	return perSheet(() => []) as unknown as WorkspaceHeld;
}

/** the records of one sheet, read as the sheet's own type is erased to here. */
function recordsOf(transfer: WorkspaceTransfer, sheet: AnySheet): never[] {
	return (transfer as unknown as Record<string, never[]>)[sheet.concept] ?? [];
}

/**
 * What a transfer asks the workspace to write.
 *
 * What a record holds and nothing it derives: a contract's status, its paid and its expected
 * amount and a unit's status are recomputed from the term and the payments, and a file that
 * could assert them could put a workspace into a state its own rows contradict. Written here
 * rather than by each surface that confirms an import, so there is one answer to which fields
 * cross and five surfaces cannot come to disagree about it. Each sheet says which of its fields
 * those are.
 */
export function toTransferInput(transfer: WorkspaceTransfer): TransferInput {
	return perSheet((sheet) => {
		const records = recordsOf(transfer, sheet);

		return sheet.toInput ? records.map((record) => sheet.toInput!(record)) : records;
	}) as TransferInput;
}

/** How many records a transfer holds, across every sheet. */
export function countTransfer(transfer: WorkspaceTransfer) {
	return sheets().reduce((total, sheet) => total + recordsOf(transfer, sheet).length, 0);
}

/** What the tab for a concept is called in a file this writes. */
export function toSheetTitle(concept: TransferConcept) {
	return sheetOf(concept).names.written;
}

/** Every sheet of the file, in the order the reader has to read them back in. */
export function toWorkbook(transfer: WorkspaceTransfer): ExportSheet[] {
	return sheets().map((sheet) =>
		toExportSheet(sheet.columns, recordsOf(transfer, sheet), sheet.names.written)
	);
}

/** What a sheet of the file would do, on its own terms. */
export type WorkspaceSheetPlan = {
	concept: TransferConcept;
	/** whether the file carried a sheet for this concept at all. */
	present: boolean;
	/** how many records it would create. */
	create: number;
	rejected: ImportRejection[];
	collisions: ImportCollision[];
	missingColumns: string[];
	/**
	 * whether the columns it is missing are ones a row is identified by.
	 *
	 * The difference between a sheet this cannot read at all and one it can read but cannot
	 * create from — the second is what a directory's own export is, and it still has to be able
	 * to say that it would change nothing.
	 */
	unreadable: boolean;
};

/** A row naming a record nothing answers to. */
export type UnresolvedReference = {
	concept: TransferConcept;
	/** the row's place in its sheet, counting the heading as row one. */
	row: number;
	/** what it named. */
	reference: string;
};

/** What importing a file would do, worked out before it does any of it. */
export type WorkspacePlan = {
	sheets: WorkspaceSheetPlan[];
	unresolved: UnresolvedReference[];
	/**
	 * whether an unresolved reference refuses the whole file rather than only the row that made
	 * it.
	 *
	 * A question about the file rather than about the reference. A workspace file's sheets depend
	 * on each other — a contract dropped for a unit nothing answers to takes its payments with it
	 * — so what survived would be a workspace the file never described, and it is refused whole.
	 * A file of one concept has nothing in it that could depend on the dropped row, so the row is
	 * turned away like any other bad row and the rest of the file still goes in.
	 */
	refusedWhole: boolean;
	/** what would be written, or nothing at all where the file is refused. */
	transfer: WorkspaceTransfer;
};

/** Whether a plan may be carried out at all. */
export function isWorkspaceImportable(plan: WorkspacePlan) {
	const refused = plan.sheets.some((sheet) => sheet.unreadable || sheet.collisions.length > 0);

	// a file refused whole has had its transfer emptied, so the count below is what says so —
	// there is no second place holding that answer.
	return !refused && countTransfer(plan.transfer) > 0;
}

const key = toTransferKey;

/** A number a file states, or nothing where the cell is not one. */
export function toStatedNumber(value: string) {
	const stated = value.trim().replace(/,/g, '');

	if (!stated) {
		return undefined;
	}

	const parsed = Number(stated);

	return Number.isFinite(parsed) ? parsed : undefined;
}

/** the names a held record is keyed under, as one list whichever shape it was held in. */
function namesOf(name: HeldName) {
	return typeof name === 'string' ? [name] : name;
}

/**
 * The table a concept's sheet is, out of the file's own tabs.
 *
 * By name, never by position: a reader who dragged the tabs into another order handed over the
 * same workspace. The exception is a file of one table read for one concept — a directory's own
 * export is a single sheet whose tab is named by whatever wrote it, `Sheet1` from a workbook and
 * the file's own name from a delimited file, and neither says what the rows are. What says it
 * there is the directory the reader opened the file from.
 */
function tableFor(
	tables: readonly ImportTable[],
	sheet: AnySheet,
	concepts: readonly TransferConcept[]
) {
	const accepted = sheet.names.accepted.map((name) => key(name));
	const named = tables.find((table) => accepted.includes(key(table.name)));

	if (named || concepts.length > 1 || tables.length !== 1) {
		return named;
	}

	return tables[0];
}

/**
 * Work out what a file would do to a workspace.
 *
 * Every sheet is read on its own terms first — which columns it has, which of its rows are rows
 * at all, whether it repeats a record — and only then is what survived resolved against the
 * file's other sheets and against the workspace. Both, because a file may create a complex and
 * the units in it at once, and may equally add a unit to a complex the workspace already holds.
 * The sheets are read in their order, so what a row names has always been read before it.
 *
 * The same pass serves a directory, which is the whole workspace scoped to one concept: a file
 * of units is the workspace file's Units sheet on its own, read by the same declaration and
 * resolved against the same workspace. What differs is only what a dropped row costs — see
 * `refusedWhole`.
 *
 * @param tables the file, as the reader handed it over: one table per sheet, each named.
 * @param now the moment the file is being read, which one of the rules below is measured
 *   against. Passed rather than read, and required rather than defaulted, for the reason every
 *   other date-sensitive answer here takes one: a module that reached for the clock itself
 *   could not be asked what a file means on a chosen day, and a parameter a caller may omit is
 *   one a caller will omit. The surfaces hand it `Date.now()`; a test hands it the day it wants
 *   to ask about.
 * @param held what the workspace already has, by the same names the file uses.
 * @param concepts which of them this file is being read for. Every one by default, which is a
 * whole workspace; one, which is a directory.
 */
export function planWorkspaceImport(
	tables: readonly ImportTable[],
	now: number,
	held: WorkspaceHeld = emptyHeld(),
	concepts: readonly TransferConcept[] = transferConcepts()
): WorkspacePlan {
	const sheetPlans: WorkspaceSheetPlan[] = [];
	const unresolved: UnresolvedReference[] = [];
	const transfer = perSheet((): unknown[] => []);
	const heldOf = (concept: string): HeldName[] =>
		(held as Record<string, HeldName[] | undefined>)[concept] ?? [];

	/**
	 * what a row naming a concept may resolve to once the file has been read this far: the
	 * workspace's own, plus everything the file would create. A unit may name a complex from
	 * either side.
	 */
	const answering = (concept: string) => {
		const target = sheetOf(concept);
		const answers = target.answers;

		return new Set([
			...heldOf(concept).map((name) => key(...(answers?.held?.(name) ?? namesOf(name)))),
			...(answers ? transfer[concept].map((record) => key(...answers.record(record as never))) : [])
		]);
	};

	for (const sheet of sheets()) {
		const concept = sheet.concept as TransferConcept;

		// a concept outside the scope gets no line at all, rather than a line saying its sheet was
		// absent: a file read for one directory was never asked for the other four, and reporting
		// them missing would read as four faults.
		if (!concepts.includes(concept)) {
			continue;
		}

		const table = tableFor(tables, sheet, concepts);

		if (!table) {
			sheetPlans.push({
				concept,
				present: false,
				create: 0,
				rejected: [],
				collisions: [],
				missingColumns: [],
				unreadable: false
			});

			continue;
		}

		const plan = planImport<Record<string, string>>(
			sheet.fields as readonly ImportField<Record<string, string>>[],
			table,
			(row) => sheet.validate?.(row as never, now),
			new Set(heldOf(concept).map((name) => key(...namesOf(name)))),
			{ rowsMayRepeat: sheet.rowsMayRepeat }
		);

		sheetPlans.push({
			concept,
			present: true,
			create: plan.create.length,
			rejected: plan.rejected,
			collisions: plan.collisions,
			missingColumns: plan.missingColumns,
			unreadable: plan.isUnreadable
		});

		// asked once per sheet, of the sheets before it, which have all been read by now.
		const targets = new Map<string, Set<string>>();
		const answered = (reference: Reference) => {
			if (!targets.has(reference.concept)) {
				targets.set(reference.concept, answering(reference.concept));
			}

			return targets.get(reference.concept)!.has(key(...reference.values));
		};

		for (const { row, record } of plan.create) {
			const missing = (sheet.references?.(record as never) ?? [])
				.filter((reference) => !answered(reference))
				.map((reference) => reference.reference);

			if (missing.length > 0) {
				for (const reference of missing) {
					unresolved.push({ concept, row, reference });
				}

				continue;
			}

			transfer[concept].push(sheet.toRecord(record as never));
		}
	}

	// a reference nothing answers to always drops the row that made it. Whether it also refuses
	// the file is a question about the file rather than about the reference: a workspace file's
	// sheets depend on each other, so what survived would be a workspace the file never described
	// — but a file of one concept holds nothing that could have depended on the dropped row, and
	// turning away the rest of it would refuse a file that is almost entirely right.
	const refusedWhole = unresolved.length > 0 && concepts.length > 1;

	return {
		sheets: sheetPlans,
		unresolved,
		refusedWhole,
		transfer: refusedWhole ? emptyTransfer() : (transfer as WorkspaceTransfer)
	};
}
