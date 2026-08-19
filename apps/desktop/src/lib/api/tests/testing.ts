// Shared harness for the router characterization tests: a real tRPC caller bound to an
// isolated in-memory database, a fixed clock, and a fake host. Not a `*.test.ts` file, so
// the test runner does not pick it up directly.

import {
	closeFileDatabase,
	createFileDatabase,
	createMemoryDatabase
} from '$lib/platform/database/memory.ts';
import { newId } from '$lib/platform/database/identity.ts';
import type { Identity } from '$lib/api/context.ts';
import type { Host } from '$lib/platform/host.ts';
import { fakeHost } from '$lib/platform/tests/testing.ts';
import { appRouter } from '../router.ts';
import { caller, context } from '../trpc.ts';

/**
 * The person a request is acting as.
 *
 * Written out here rather than derived from {@link fakeAccount}, because the two are not the same
 * thing wearing different names: an account is a row this machine holds, and an identity is who a
 * procedure is answering for. They agree today and a test that needs them to disagree can say so.
 */
export function fakeIdentity(overrides: Partial<Identity> = {}): Identity {
	return {
		accountId: 'account',
		email: 'person@example.com',
		displayName: 'Person Example',
		...overrides
	};
}

// A fixed instant — the real "now" — so status derivation is pinned identically whether a
// procedure reads the clock ambiently today or from the injected context later. Express
// contract dates relative to it via `monthsFromNow`.
export const NOW = Date.now();

export function monthsFromNow(months: number, days = 0) {
	const base = new Date(NOW);
	return Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + months, base.getUTCDate() + days);
}

/**
 * A caller over the whole router, as a router test holds it. Read off {@link createApi} rather
 * than assembled from tRPC's own generics, so it is the harness that defines it and the two
 * cannot disagree.
 */
export type Api = Awaited<ReturnType<typeof createApi>>;

// A fresh caller over an isolated in-memory database, the fixed clock, and a fake host.
// The default host covers only what procedures actually read; pass `host` to override it.
// Pass `onStatement` to see every statement a procedure issues, for asserting what it costs
// rather than only what it leaves behind.
//
// The identity is supplied rather than resolved, and every router test wants that: a fake host
// refuses `remoteSync.getState` by name, and a context that had to resolve an acting user over
// one would refuse every test in the suite for want of a sign-in none of them is about.
export async function createApi({
	host,
	onStatement
}: { host?: Host; onStatement?: (sql: string) => void } = {}) {
	const db = createMemoryDatabase(onStatement);
	const ctx = await context({
		db,
		clock: { now: () => NOW },
		host: host ?? fakeHost(),
		identity: fakeIdentity()
	});

	return caller(appRouter)(ctx);
}

let sequence = 0;

// Creates a tenant with a unique national id and phone, so fixtures never collide on the
// uniqueness constraints.
export async function seedTenant(api: Api) {
	sequence += 1;
	const suffix = String(sequence).padStart(4, '0');

	return api.tenant.create({
		name: `Tenant ${suffix}`,
		nationalId: `1000${suffix}00`.slice(0, 10),
		phone: `+96655${suffix}000`.slice(0, 13)
	});
}

// A caller over a database that is a real file, so a test can open it again afterwards. Only
// durability needs it; everything else should use `createApi`.
export async function createFileApi(path: string, { host }: { host?: Host } = {}) {
	const db = createFileDatabase(path);
	const ctx = await context({
		db,
		clock: { now: () => NOW },
		host: host ?? fakeHost(),
		identity: fakeIdentity()
	});

	// the closer comes back with it: Windows refuses to remove a file that is still open, so a
	// test that tidies up after itself has to let go of the handle first.
	return { api: caller(appRouter)(ctx), close: () => closeFileDatabase(db) };
}

// An identity no record holds, for the cases that ask what a procedure does when the record is
// not there. Minted rather than written out, so it is well-formed — a gate that refuses it for
// its shape would answer the question the test is not asking.
export { newId as unusedId };
