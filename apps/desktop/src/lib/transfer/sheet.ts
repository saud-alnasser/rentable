import type { Contributed } from '$lib/api/contribution';
import type { Database } from '$lib/api/context';
import type { RefusalCode } from '$lib/api/refusal';
import type { features } from '$lib/app/features';
import type { ExportColumn } from '@rentable/design/csv.js';
import type { Flag } from '@rentable/workspace-permission';
import type { ZodType } from 'zod';
import type { ImportField } from './import';

/**
 * WHAT A FEATURE DECLARES
 *
 * the sheet a record feature hands the transfer in its `feature.ts`, what the write hands a
 * sheet and takes back from it, and the types a workspace file is read as, derived from every
 * sheet the features declare. `transfer.ts` reads and plans a file against these.
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

/**
 * What a read is handed where what the clock derives has to be derived as it reads rather than read
 * as stored: the instant to derive it at, and what the features contribute, which a derivation may
 * read through. Handed for a workspace read on Turso without being open (effort 846, requirement
 * 15), which nothing may have reconciled since a day passed; the open one is reconciled on every
 * trigger and is read as stored.
 */
export type Deriving = { now: number } & Contributed;

/**
 * What a record holds over a stretch of days that no other record may hold over the same days: a
 * unit a live contract holds over its term. Read off the records of a sheet that declares
 * `claims`, from the workspace and from the file alike, so two of them can be compared without the
 * transfer knowing what either is.
 */
export type Claim = {
	/** what is held, as the transfer keys it (`toTransferKey`): two claims meet only on one key. */
	key: string;
	/** what is held, the way a file names it, which is what a refusal says back. */
	label: string;
	start: number;
	end: number;
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
	/**
	 * The id a name stands for, or nothing where no record answers to it or more than one does.
	 *
	 * For a name a row may carry without it resolving, which is never one of the row's
	 * `references`: those drop the row in the planning pass, and that pass reads each sheet's
	 * targets once, before the rows of the same sheet are named. Asked once the sheet has named
	 * every record it writes, a name answers to any of them whatever its row, and to the records
	 * the workspace holds. A contract's `Renews` is the one such name (effort 861, ticket 14).
	 */
	find(concept: string, name: string, values?: readonly string[]): string | undefined;
};

/** What a sheet's writer hands back: its statements, how many records, and what it touched. */
export type Written = {
	statements: Statement[];
	count: number;
	/** the ids a settling pass is scoped to, by what they are, merged across every sheet. */
	touched?: Record<string, readonly string[]>;
	/**
	 * statements that run at the end of the same batch, after every sheet's own: what a record may
	 * only become once the sheets after it have written what they hold of it.
	 */
	closing?: Statement[];
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
	/**
	 * every record the workspace holds, in the shape and the order the file holds them. With
	 * `deriving`, what a record derives from the clock is derived at its instant.
	 */
	read(db: Database, deriving?: Deriving): Promise<TRecord[]>;
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
	/**
	 * What its records hold that no two of them may hold at once. Absent on a sheet whose records
	 * claim nothing.
	 */
	claims?: {
		/** what the records the workspace holds claim now. */
		held(db: Database): Promise<Claim[]>;
		/** what a record the file creates would claim. */
		of(record: TRecord): Claim[];
		/** whether two claims on one key clash: the concept's own rule. */
		clash(a: Claim, b: Claim): boolean;
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
	read(db: Database, deriving?: Deriving): Promise<unknown[]>;
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
	claims?: {
		held(db: Database): Promise<Claim[]>;
		of(record: never): Claim[];
		clash(a: Claim, b: Claim): boolean;
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

/**
 * A feature as the transfer reads it: whatever else it declares, its name and perhaps its sheets.
 * The feature contract (`$lib/feature/feature`) sits below this capability and cannot name a sheet,
 * so this is where a declared sheet is checked: the composition root hands the list over as this.
 */
export type Declaring = { name: string; transfer?: Transfer };

type RecordOf<S> = S extends { read(db: Database): Promise<(infer R)[]> } ? R : never;
type InputOf<S> = S extends { input: ZodType<infer I> } ? I : never;

/** A whole workspace as a file holds it, one list of records per sheet. */
export type FileOf<S extends AnySheet> = { [K in S as K['concept']]: RecordOf<K>[] };
/** What a whole workspace asks the write to store, one list per sheet. */
export type InputFileOf<S extends AnySheet> = { [K in S as K['concept']]: InputOf<K>[] };
/**
 * What the workspace holds, by the names a file uses, one list per sheet; and, under `claims`, what
 * the records of each sheet that declares them claim now.
 */
export type HeldOf<S extends AnySheet> = { [K in S as K['concept']]: HeldName[] } & {
	claims?: { [K in S as K['concept']]?: Claim[] };
};
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
export function sheetsOf(declaring: readonly Declaring[]): AnySheet[] {
	return declaring.flatMap((feature) => feature.transfer ?? []).sort((a, b) => a.order - b.order);
}
