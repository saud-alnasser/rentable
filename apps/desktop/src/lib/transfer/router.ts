import { autosync, procedure, router, type Flags } from '$lib/api/trpc';
import { refuse } from '$lib/api/refusal';
import { EXPORT_FLAGS, IMPORT_FLAGS } from '$lib/permission';
import { permits } from '@rentable/workspace-permission';
import z, { type ZodType } from 'zod';
import { toTransferKey } from './reference';
import type {
	AnySheet,
	CountOf,
	FileOf,
	HeldName,
	HeldOf,
	InputFileOf,
	Statement,
	Writing
} from './sheet';

/**
 * THE WORKSPACE, WHOLE
 *
 * the whole workspace as one thing: read out of the database in the shape a file holds it, and
 * written back from that shape in a single batch. Built from the sheets the features declare,
 * which the composition root hands over (`app/features.ts`); each sheet reads, holds and writes
 * its own records, and this runs them in their order.
 *
 * **Nothing here decides what a file means.** Which columns it has, which of its rows are
 * records and whether a reference resolves are all answered in the planning pass
 * (`transfer.ts`) before this is called: a batch is built before any of it runs and cannot
 * branch on its own results ([[rules/data]], under *Multi-table writes*), so the resolution
 * could not happen here even if it belonged here.
 *
 * What this does own is the one thing the planning pass cannot know: the identities. A record
 * names another by a name, and the row it becomes names it by an id.
 *
 * **Any workspace the member holds a grant on, not only the open one** (effort 846, requirement
 * 15). Each procedure takes `{ workspaceId }` through `procedure.permittedIn`: naming nothing, or
 * the open one, reads and writes this machine's replica as it always has, offline included; naming
 * another reaches it on Turso without opening it, and asks the member's flags there.
 */
// every kind's view and every kind's create, as `$lib/permission` reads them off the kinds: a file
// holds every kind. Never an empty list, since there is always a kind, which is what a gate's
// `Flags` asks the compiler to know.
const EXPORT_GATE = EXPORT_FLAGS as unknown as Flags;
const IMPORT_GATE = IMPORT_FLAGS as unknown as Flags;

export default function transferRouter<S extends AnySheet>(declared: readonly S[]) {
	const sheets = [...declared].sort((a, b) => a.order - b.order);

	// what a file may ask to be written, and nothing else: each sheet's own. A status, a paid
	// amount and an expected amount are absent on purpose: they are derived from a contract's term
	// and its payments, and a file that could assert them could put a workspace into a state its
	// own rows contradict. Typed on the way in as well as out, because it is merged beside the
	// `{ workspaceId }` that `permittedIn` reads first, and an input left `unknown` would leave a
	// caller only the workspace to name.
	const input = z.object(
		Object.fromEntries(sheets.map((sheet) => [sheet.concept, z.array(sheet.input)]))
	) as unknown as ZodType<InputFileOf<S>, InputFileOf<S>>;

	return router({
		/**
		 * The whole workspace, in the shape a file holds it.
		 *
		 * Every record names what it points at by a name rather than by an id, and it is composed
		 * here rather than in the surface that writes the file: the reference a payment carries has
		 * to be the same string the contracts sheet carries, and two places composing it separately
		 * is two places for them to drift apart.
		 *
		 * **Every kind's view flag**, because the file holds every kind and a sheet left out would be
		 * an export that cannot be imported back whole (effort 838, requirement 10).
		 *
		 * **A workspace that is not open derives as it reads**: nobody may have reconciled it since a
		 * day passed, and a read-only reader cannot write it, so a status is what the term and the
		 * payments make it now rather than what was stored (effort 846, requirement 15).
		 */
		get: procedure.permittedIn(...EXPORT_GATE).query(async ({ ctx }): Promise<FileOf<S>> => {
			const file: Record<string, unknown[]> = {};
			const deriving = ctx.opened
				? undefined
				: { now: ctx.clock.now(), contributions: ctx.contributions };

			for (const sheet of sheets) {
				file[sheet.concept] = await sheet.read(ctx.db, deriving);
			}

			return file as FileOf<S>;
		}),

		/**
		 * What the workspace already holds, by the names a file uses.
		 *
		 * Read as values rather than as rows, and in one call rather than one per concept: a file of
		 * a thousand records checked one at a time would be a thousand round trips before any of it
		 * is written, which is the cost the tenant import already reckoned with.
		 *
		 * **Open to every member, and a kind they may not view is answered as holding nothing**
		 * (effort 838, requirement 10). It serves the import of one directory as well as the whole
		 * workspace, and a unit's import reads the complexes it names, so asking for every view flag
		 * would refuse a member the one import they may make. What they cannot view they are not told
		 * of; a row duplicating it is refused by the write instead of by the plan. What they may view
		 * is what they may view in the workspace named, where one is.
		 */
		held: procedure.permittedIn().query(async ({ ctx }): Promise<HeldOf<S>> => {
			const held: Record<string, HeldName[]> = {};

			for (const sheet of sheets) {
				const names = await sheet.held(ctx.db);

				held[sheet.concept] = permits(ctx.identity.permissions, sheet.view) ? names : [];
			}

			return held as HeldOf<S>;
		}),

		/**
		 * Write a whole workspace, in one batch.
		 *
		 * **Every identity is decided before the batch is built.** A batch cannot branch on its own
		 * results, so a unit cannot ask for the id of the complex inserted two statements above it —
		 * the ids are minted by each sheet, one per row, which is what every other creation path does
		 * too.
		 *
		 * The sheets write in their order, which is the order the schema allows: a complex before
		 * the units in it, a tenant before the contracts naming them, a contract before its
		 * assignments and its payments. The boundary runs a batch inside a transaction, so a refusal
		 * anywhere leaves the workspace exactly as it was: nothing half-written, and no order in
		 * which it could be.
		 *
		 * References are resolved again here rather than trusted: the plan was made against the
		 * workspace as it was when the file was opened, and a record it named may have been deleted
		 * by hand in between.
		 *
		 * **Every kind's create flag**, because a file may hold every kind and the batch writes them
		 * all or none (effort 838, requirement 10).
		 */
		importWhole: procedure
			.permittedIn(...IMPORT_GATE)
			.use(autosync())
			.input(input)
			.mutation(async ({ input, ctx }): Promise<CountOf<S>> => {
				const now = ctx.clock.now();
				const records = input as unknown as Record<string, never[]>;

				// what a name resolves to, whether the record is already here or is about to be. The
				// two are indistinguishable to the row that names it, which is the whole point of a
				// file that references by name.
				const ids = new Map<string, Map<string, string>>();

				for (const sheet of sheets) {
					const answering = new Map<string, string>();

					for (const [values, id] of (await sheet.answers?.ids(ctx.db)) ?? []) {
						answering.set(toTransferKey(...values), id);
					}

					ids.set(sheet.concept, answering);
				}

				const resolve: Writing['resolve'] = (concept, name, values = [name]) => {
					const answers = sheets.find((sheet) => sheet.concept === concept)?.answers;

					if (!answers) {
						throw new Error(`no sheet answers to a name of ${concept}`);
					}

					const id = ids.get(concept)?.get(toTransferKey(...values));

					if (id === undefined) {
						throw refuse(answers.unknown, { name: name.trim() });
					}

					return id;
				};

				const statements: Statement[] = [];
				const counts: Record<string, number> = {};
				const touched: Record<string, string[]> = {};

				for (const sheet of sheets) {
					const written = await sheet.write(records[sheet.concept] ?? [], {
						db: ctx.db,
						now,
						name: (values, id) => ids.get(sheet.concept)!.set(toTransferKey(...values), id),
						resolve
					});

					statements.push(...written.statements);
					counts[sheet.concept] = written.count;

					for (const [what, touchedIds] of Object.entries(written.touched ?? {})) {
						(touched[what] ??= []).push(...touchedIds);
					}
				}

				if (statements.length === 0) {
					throw refuse('workspace.nothingToImport');
				}

				// the batch's type asks for at least one statement, and the guard above is what
				// establishes it.
				const [first, ...rest] = statements;

				await ctx.db.batch([first, ...rest]);

				// what the file could not carry, recomputed over what was written: see each sheet's
				// `settle`.
				for (const sheet of sheets) {
					await sheet.settle?.(ctx, now, touched);
				}

				return counts as CountOf<S>;
			})
	});
}
