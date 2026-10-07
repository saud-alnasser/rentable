import type { Database } from '$lib/api/context';
import type { ContributedRead } from '$lib/feature/surface';
import type { RecordKind } from '$lib/permission';
import * as s from '$lib/platform/database/schema';
import type { Contract } from '$lib/platform/database/schema';
import { ensureIdFree, refuse } from '$lib/api/refusal';
import { inArray } from 'drizzle-orm';
import z from 'zod';

/**
 * TENANT
 *
 * the tenant domain module: identity and phone validation, the rules routers assert before
 * persisting, and what a caller is allowed to ask for when reading. Per the glossary, the
 * identity field holds both a citizen's national identity number and a resident's iqama,
 * distinguished by leading digit — `identity` names the broader concept, never one of its
 * two forms.
 */

/**
 * The kind of record a tenant is, as its declaration names it: what a feature depending on the
 * tenant asks the reader's permissions about, rather than spelling the kind itself.
 */
export const TENANT_KIND = 'tenant' satisfies RecordKind;

export const identity = /^[12]\d{9}$/;
export const phone = /^(\+9665)(5|0|3|6|4|9|1|8|7)([0-9]{7})$/;

/**
 * The keys the tenants directory may be ordered by, and the whole of what its sort control
 * may offer — an order outside this list is one the query cannot answer, so the router
 * rejects it rather than silently falling back to the default.
 *
 * It lives here rather than beside the SQL because it decides what a caller is allowed to
 * ask for, and it is exported because the control has to be built from the same list: two
 * places naming the orders is how a control comes to offer one the query cannot serve.
 */
export const TENANT_SORT_COLUMN_IDS = ['name', 'nationalId', 'activeContractCount'] as const;

export type TenantSortColumnId = (typeof TENANT_SORT_COLUMN_IDS)[number];

/**
 * the identity field, for every caller that validates one. `message` is the caller's, so the
 * webview passes a translated string where the schema passes a fixed one.
 *
 * The trim is what lets an identity stored under the older unanchored pattern still be saved:
 * the form pre-fills from the row, so anchoring alone would strand those tenants.
 */
export const identityField = (message: string) => z.string().trim().regex(identity, message);

/**
 * A tenant as the routers take it in. The table is `tenant` in `$lib/platform/database/schema`;
 * this is kept here because it is built from the validators above, and the platform imports no
 * feature. `ASCII_ONLY_COLUMNS` in that schema holds only while these two fields refuse an
 * Arabic-Indic digit.
 */
export const TenantSchema = z.object({
	id: z.string(),
	name: z.string(),
	nationalId: identityField(
		'national identity number must start with 1 or 2; and be 10 digits long'
	),
	phone: z.string().regex(phone, 'phone must start with +966; and be 10 digits long')
});

export type Tenant = z.infer<typeof TenantSchema>;

/**
 * the router passes whatever row its uniqueness query found; any row is a conflict.
 *
 * @param named the identity the conflict is over, where the caller acts on more than one tenant.
 * Putting a deleted selection back is refused as a set, and *one of them is already registered*
 * is not something a reader can act on. The single-record callers pass nothing: their reader is
 * looking at the one field it is about.
 */
export function ensureIdentityAvailable(conflicting: unknown, named?: string) {
	if (conflicting) {
		throw named
			? refuse('tenant.nationalIdTakenNamed', { named })
			: refuse('tenant.nationalIdTaken');
	}
}

/**
 * the router passes whatever row its uniqueness query found; any row is a conflict.
 *
 * @param named the phone the conflict is over, for the reason {@link ensureIdentityAvailable}
 * gives: the two are the same gate over a tenant's other unique field.
 */
export function ensurePhoneAvailable(conflicting: unknown, named?: string) {
	if (conflicting) {
		throw named ? refuse('tenant.phoneTakenNamed', { named }) : refuse('tenant.phoneTaken');
	}
}

/**
 * Whether a set of tenants may all be written at once, refusing by name where one may not.
 *
 * Every check a create makes, asked once for the whole set: the set against itself on all three
 * things a tenant is unique by, then against the workspace on each. A set that contradicts itself
 * or the workspace is a contradiction the engine would only report part-way through a batch, as a
 * raw constraint error, and these writes are meant to land whole or not at all. One function for
 * every caller writing a set, `tenant.createMany` and a file's Tenants sheet, so the two cannot
 * come to check different things.
 */
export async function ensureTenantsAvailable(
	db: Database,
	tenants: readonly { id: string; nationalId: string; phone: string }[]
) {
	const ids = tenants.map((tenant) => tenant.id);
	const nationalIds = tenants.map((tenant) => tenant.nationalId);
	const phones = tenants.map((tenant) => tenant.phone);

	const repeated =
		ids.find((id, index) => ids.indexOf(id) !== index) ??
		nationalIds.find((nationalId, index) => nationalIds.indexOf(nationalId) !== index) ??
		phones.find((phone, index) => phones.indexOf(phone) !== index);

	if (repeated) {
		throw refuse('tenant.repeatedInSet', { value: repeated });
	}

	const held = await db.select().from(s.tenant).where(inArray(s.tenant.id, ids));

	ensureIdFree(held[0], held[0]?.id);

	const registered = await db
		.select()
		.from(s.tenant)
		.where(inArray(s.tenant.nationalId, nationalIds));

	ensureIdentityAvailable(registered[0], registered[0]?.nationalId);

	const reachable = await db.select().from(s.tenant).where(inArray(s.tenant.phone, phones));

	ensurePhoneAvailable(reachable[0], reachable[0]?.phone);
}

/**
 * The row an update wrote back, or the refusal that it wrote none.
 *
 * An update matching no row writes nothing and answers with nothing, which reads at every call
 * site as success. That is survivable while this machine is the only writer, and it stops being
 * survivable the moment another device can delete a record between this one reading it and
 * writing it. The caller that meets it first is an inverse — see [[rules/data]], under *Undo*,
 * which is where the reasoning lives and which requires this to fail visibly rather than
 * silently write nothing, and requires it not to put the row back.
 */
export function ensureTenantStillExists<T>(tenant: T | undefined | null): T {
	if (!tenant) {
		throw refuse('tenant.gone');
	}

	return tenant;
}

/**
 * Whether a tenant may be deleted: no contract may mention it.
 *
 * The predicate is exported beside the rule that enforces it so a surface can say what blocks
 * a deletion before offering one, rather than restating the threshold in its own words.
 */
export const isTenantDeletable = (contracts: unknown[]) => contracts.length === 0;

export function ensureTenantDeletable(contracts: unknown[]) {
	if (!isTenantDeletable(contracts)) {
		throw refuse('tenant.holdsContracts');
	}
}

/**
 * Why one tenant in a selection would be turned away.
 *
 * `missing` is not a rule this concept enforces: it says the row named is no longer in the
 * workspace, which every selection can meet because another device may delete a record between
 * the reader picking it out and asking for the action.
 */
export type TenantRefusalReason = 'holds-contracts' | 'missing';

/**
 * Why deleting this tenant would be refused, or `undefined` where it would go through.
 *
 * {@link isTenantDeletable} called rather than restated, so what a reader is shown before the
 * deletion and what the deletion decides cannot come to be two rules.
 *
 * It takes no action, where the contract's equivalent takes one of three: a selection of tenants
 * admits deleting and nothing else, and a parameter with one legal value is not a choice. The day
 * a second action arrives is the day it becomes one.
 */
export const whatRefusesTenantDeletion = (contracts: unknown[]) =>
	isTenantDeletable(contracts) ? undefined : ('holds-contracts' as const);

/**
 * What the tenant's router needs of the contracts naming it, contributed by the contract, which
 * depends on the tenant rather than the other way round (`$lib/feature/feature`, under *What a
 * feature contributes*).
 */
export type TenantContributions = {
	/**
	 * the statuses of a contract in force, which is what the reader means by a tenant's contracts
	 * when they order the directory by them.
	 */
	inForceStatuses: readonly Contract['status'][];
};

/** What the tenant's pages, host and acts need of the contracts naming it, in the window. */
export type TenantSurfaceContributions = {
	/**
	 * every status a contract can hold, in the order the contracts directory ranks them: the order
	 * a directory row draws its six figures in.
	 */
	attentionOrder: readonly Contract['status'][];
	/** whether the reader may see contracts at all, and so the counts a row carries of them. */
	viewsContracts: () => boolean;
	/**
	 * every contract naming the tenant, read only while `enabled` says so: what refuses its
	 * deletion ({@link isTenantDeletable}).
	 */
	useHeldContracts: (
		tenantId: () => string | undefined,
		enabled: () => boolean
	) => ContributedRead<unknown[]>;
	/** open a new contract on the tenant. */
	newContract: (tenantId: string) => void;
};
