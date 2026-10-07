import type { ExportSheet, ImportTable } from './host';
import { toExportSheet } from '@rentable/design/csv.js';
import {
	planImport,
	toHeldIdentities,
	type ImportCollision,
	type ImportField,
	type ImportRejection
} from './import';
import { toTransferKey } from './reference';
import {
	sheetsOf,
	type AnySheet,
	type Claim,
	type Declaring,
	type HeldName,
	type Reference,
	type TransferConcept,
	type TransferInput,
	type WorkspaceHeld,
	type WorkspaceTransfer
} from './sheet';

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
 * What a sheet declares, and the types a file is read as, are `sheet.ts`'s.
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
 * **The sheets are bound in, never imported.** Every sheet is a feature's, and this capability
 * sits below the features, so it knows them only as the composition root hands them over:
 * `$lib/app/transfer` binds them once, as the root layout loads, as `$lib/app/caller` binds the
 * root router. The router is handed the same list where `app/features.ts` builds it.
 */
let bound: AnySheet[] | null = null;

/** Bind the sheets every feature declares. Called once, by `$lib/app/transfer`. */
export function bindTransfer(declaring: readonly Declaring[]) {
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
 * could assert them could put a workspace into a state its own rows contradict. A contract's
 * termination is the exception, because a person set it and no term or payment derives it. Written here
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
		(held as unknown as Record<string, HeldName[] | undefined>)[concept] ?? [];

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

		const fields = sheet.fields as readonly ImportField<Record<string, string>>[];
		const plan = planImport<Record<string, string>>(
			fields,
			table,
			(row) => sheet.validate?.(row as never, now),
			// keyed per identity group, so a tenant held by its national id is matched by that alone.
			new Set(heldOf(concept).flatMap((name) => toHeldIdentities(fields, namesOf(name)))),
			{ rowsMayRepeat: sheet.rowsMayRepeat }
		);

		const sheetPlan: WorkspaceSheetPlan = {
			concept,
			present: true,
			create: plan.create.length,
			rejected: [...plan.rejected],
			collisions: [...plan.collisions],
			missingColumns: plan.missingColumns,
			unreadable: plan.isUnreadable
		};

		sheetPlans.push(sheetPlan);

		// what this sheet's records claim, against what the workspace's claim and against the
		// rows of the file before them. A row taking what a held record holds is turned away like
		// a row repeating one; two rows of the file taking one thing contradict each other, and
		// refuse the sheet as two rows claiming one identity do.
		const claiming = sheet.claims;
		const heldClaims =
			(held.claims as Record<string, Claim[] | undefined> | undefined)?.[concept] ?? [];
		const claimed: { row: number; claim: Claim }[] = [];
		const clashing = (a: Claim, b: Claim) => a.key === b.key && claiming!.clash(a, b);

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

			const created = sheet.toRecord(record as never);

			if (claiming) {
				const claims = claiming.of(created as never);
				const taken = claims.find((claim) => heldClaims.some((each) => clashing(each, claim)));

				if (taken) {
					sheetPlan.rejected.push({ row, reason: 'claim-taken', detail: taken.label });
					sheetPlan.create -= 1;

					continue;
				}

				for (const claim of claims) {
					const earlier = claimed.find((each) => clashing(each.claim, claim));

					if (earlier) {
						sheetPlan.collisions.push({ rows: [earlier.row, row], identity: claim.label });
					}
				}

				claimed.push(...claims.map((claim) => ({ row, claim })));
			}

			transfer[concept].push(created);
		}

		sheetPlan.rejected.sort((a, b) => a.row - b.row);
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
