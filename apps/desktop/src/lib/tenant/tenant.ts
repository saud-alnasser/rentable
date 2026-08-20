import { TRPCError } from '@trpc/server';
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

function badRequest(message: string): never {
	throw new TRPCError({ code: 'BAD_REQUEST', message });
}

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
		badRequest(`national id${named ? ` ${named}` : ''} is associated with a registered tenant`);
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
		badRequest(`phone${named ? ` ${named}` : ''} is associated with a registered tenant`);
	}
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
		badRequest('this tenant is no longer in the workspace — reload to see what changed');
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
		badRequest('cannot delete tenant with associated contracts');
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
