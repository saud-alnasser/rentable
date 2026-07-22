// Shared harness for the router characterization tests: a real tRPC caller bound to an
// isolated in-memory database, a fixed clock, and a fake host. Not a `*.test.mjs` file, so
// the test runner does not pick it up directly.

import { createMemoryDatabase } from './database/memory.ts';
import { appRouter } from './router.ts';
import { caller, context } from './trpc.ts';

// A fixed instant — the real "now" — so status derivation is pinned identically whether a
// procedure reads the clock ambiently today or from the injected context later. Express
// contract dates relative to it via `monthsFromNow`.
export const NOW = Date.now();

export function monthsFromNow(months, days = 0) {
	const base = new Date(NOW);
	return Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + months, base.getUTCDate() + days);
}

// A fresh caller over an isolated in-memory database, the fixed clock, and a fake host.
export async function createApi() {
	const db = createMemoryDatabase();
	const ctx = await context({ db, clock: { now: () => NOW }, host: {} });

	return caller(appRouter)(ctx);
}

let sequence = 0;

// Creates a tenant with a unique national id and phone, so fixtures never collide on the
// uniqueness constraints.
export async function seedTenant(api) {
	sequence += 1;
	const suffix = String(sequence).padStart(4, '0');

	return api.tenant.create({
		name: `Tenant ${suffix}`,
		nationalId: `1000${suffix}00`.slice(0, 10),
		phone: `+96655${suffix}000`.slice(0, 13)
	});
}
