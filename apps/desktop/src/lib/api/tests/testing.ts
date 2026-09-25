// Shared harness for the router characterization tests: a real tRPC caller bound to an
// isolated in-memory database, a fixed clock, and a fake host. Not a `*.test.ts` file, so
// the test runner does not pick it up directly.

import assert from 'node:assert/strict';

import { FAMILIES, maskOf } from '@rentable/workspace-permission';

import { readRefusal, type RefusalCode, type RefusalParams } from '$lib/api/refusal.ts';
import { toRefusalText } from '$lib/error/refusal.ts';
import type { Locales } from '$lib/i18n/i18n-types.ts';
import { i18nObject } from '$lib/i18n/i18n-util.ts';
import { loadLocale } from '$lib/i18n/i18n-util.sync.ts';
import {
	closeFileDatabase,
	createFileDatabase,
	createMemoryDatabase
} from '$lib/platform/database/memory.ts';
import { newId } from '$lib/platform/database/identity.ts';
import type { Database, Identity } from '$lib/api/context.ts';
import type { Host } from '$lib/platform/host.ts';
import { fakeHost } from '$lib/platform/tests/testing.ts';
import { appRouter } from '../router.ts';
import { caller, context } from '../trpc.ts';

/** Viewing, creating, editing and deleting every kind of record, and nothing else. */
export const EVERY_RECORD_ACT = maskOf(
	...FAMILIES.complex,
	...FAMILIES.unit,
	...FAMILIES.tenant,
	...FAMILIES.contract,
	...FAMILIES.payment
);

/**
 * The person a request is acting as.
 *
 * Written out here rather than derived from a session fixture, because the two are not the same
 * thing wearing different names: a session is what the vault opened, and an identity is who a
 * procedure is answering for. They agree today and a test that needs them to disagree can say so.
 */
export function fakeIdentity(overrides: Partial<Identity> = {}): Identity {
	return {
		accountId: 'account',
		username: 'person.example',
		// **Administering nothing by default**, which is what every router test wants: none of them
		// is about a permission, and a default that carried some would make the one test that is
		// about one pass for the wrong reason. A test that needs an act says which.
		//
		// **And every record act**, since effort 838 gates each record procedure on its flag
		// ([[rules/api-layer]]): a router test about a contract is not about whether its caller may
		// touch one. A test about a record flag takes one away.
		permissions: EVERY_RECORD_ACT,
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
// Pass `onStatement` to see every statement a procedure issues and how many rows it answered
// with, for asserting what it costs rather than only what it leaves behind.
//
// The identity is supplied rather than resolved, and every router test wants that: a fake host
// refuses `remoteSync.getState` by name, and a context that had to resolve an acting user over
// one would refuse every test in the suite for want of a sign-in none of them is about.
//
// **It administers nothing unless a test says otherwise**, which is what `identity` is for: a
// procedure permitted on an organization flag refuses this caller, so a test about one names the
// acts it needs and every other test goes on being about what it was about. It holds every record
// act, so a test about one of those names what it takes away.
//
// Pass `db` to hand in the in-memory database yourself, for a test that has to watch how a
// procedure writes to it rather than only what it issues: whether a write is one batch.
export async function createApi({
	host,
	identity,
	onStatement,
	db = createMemoryDatabase(onStatement)
}: {
	host?: Host;
	identity?: Identity;
	onStatement?: (sql: string, rowCount: number) => void;
	db?: Database;
} = {}) {
	const ctx = await context({
		db,
		clock: { now: () => NOW },
		host: host ?? fakeHost(),
		identity: identity ?? fakeIdentity()
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

/**
 * Every statement a block of work issued, so a test can say what it cost.
 *
 * `drain` throws away what the setup issued, which is what leaves the log holding only the call
 * under test. Here rather than in one concept's test file because more than one concept now has
 * a multi-record action, and *one call over the selection* is the claim each of them makes.
 */
export async function withStatementLog(run: (api: Api, drain: () => string[]) => Promise<void>) {
	const statements: string[] = [];
	const api = await createApi({ onStatement: (sql) => statements.push(sql) });

	await run(api, () => statements.splice(0, statements.length));

	return statements;
}

/** how many of the logged statements were of a kind. */
export function countMatching(statements: readonly string[], pattern: RegExp) {
	return statements.filter((sql) => pattern.test(sql)).length;
}

/**
 * What `assert.rejects` and `assert.throws` are handed to say a call was refused with this code.
 *
 * A refusal crosses as a code and its values ([[rules/api-layer]], under *Errors*), so that is
 * what a test pins rather than the message, which is a developer's description and free to change.
 * Pass `params` to pin the values the sentence will be built from as well.
 */
export function refusedWith(code: RefusalCode, params?: RefusalParams) {
	return (error: unknown) => {
		const refusal = readRefusal(error);

		assert.equal(refusal?.code, code, `expected a refusal of ${code}, got ${String(error)}`);

		if (params) {
			assert.deepEqual(refusal?.params, params);
		}

		return true;
	};
}

/**
 * What a refused call says to a reader of `locale`: the sentence the interface would show for it.
 *
 * Arabic by default, because that is the reader a refusal written as English prose used to fail
 * (effort 832, requirement 23), and the test that reads it there is the one that would notice.
 */
export async function refusalReadIn(call: () => Promise<unknown>, locale: Locales = 'ar') {
	loadLocale(locale);

	const error = await call().then(
		() => assert.fail('the call should have been refused'),
		(failure: unknown) => failure
	);

	return toRefusalText(error, i18nObject(locale));
}
