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

/** the router passes whatever row its uniqueness query found; any row is a conflict. */
export function ensureIdentityAvailable(conflicting: unknown) {
	if (conflicting) {
		badRequest('national id is associated with a registered tenant');
	}
}

/** the router passes whatever row its uniqueness query found; any row is a conflict. */
export function ensurePhoneAvailable(conflicting: unknown) {
	if (conflicting) {
		badRequest('phone is associated with a registered tenant');
	}
}

export function ensureTenantDeletable(contracts: unknown[]) {
	if (contracts.length > 0) {
		badRequest('cannot delete tenant with associated contracts');
	}
}
