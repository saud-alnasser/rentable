import { TRPCError } from '@trpc/server';

/**
 * TENANT
 *
 * the tenant domain module: identity and phone validation and the rules routers assert
 * before persisting. Per the glossary, the identity field holds both a citizen's
 * national identity number and a resident's iqama, distinguished by leading digit —
 * `identity` names the broader concept, never one of its two forms.
 */

export const identity = /\b[12]\d{9}\b/;
export const phone = /^(\+9665)(5|0|3|6|4|9|1|8|7)([0-9]{7})$/;

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
