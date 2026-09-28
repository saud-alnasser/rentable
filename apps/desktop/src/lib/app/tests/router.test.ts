import assert from 'node:assert/strict';
import test from 'node:test';

import type { AnyProcedure } from '@trpc/server';

import { router } from '$lib/api/trpc.ts';
import complex from '$lib/complex/router.ts';
import contract from '$lib/contract/router.ts';
import dashboard from '$lib/dashboard/router.ts';
import history from '$lib/history/router.ts';
import organization from '$lib/organization/router.ts';
import payment from '$lib/payment/router.ts';
import settings from '$lib/settings/router.ts';
import startup from '$lib/startup/router.ts';
import sync from '$lib/sync/router.ts';
import tenant from '$lib/tenant/router.ts';
import update from '$lib/update/router.ts';
import workspace from '$lib/workspace/router.ts';
import { features } from '../features.ts';
import { appRouter } from '../router.ts';

/**
 * THE ROOT ROUTER IS BUILT FROM THE LIST, AND IS FLAT
 *
 * Effort 840, criterion 3: the root mounts every feature's router under its name, the typed
 * client inferred from it is the one a hand-written record of the same routers gives, and no
 * feature's router mounts another's.
 */

/** Whether two types are the same type, not merely assignable one to the other. */
type Same<A, B> =
	(<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;

const handWritten = router({
	tenant,
	complex,
	contract,
	payment,
	dashboard,
	history,
	workspace,
	organization,
	settings,
	sync,
	update,
	startup
});

// A compile-time check: `pnpm check` fails here if the list changes a procedure's path or type.
const sameRouter: Same<typeof appRouter._def.record, typeof handWritten._def.record> = true;

/** The listed features with a router of their own; the unit's procedures are the complex's. */
const routed = features.flatMap((feature) => ('router' in feature ? [feature] : []));

/** Every procedure a router holds, under its dotted path; read as what `_def.procedures` holds. */
const proceduresOf = (held: { _def: { procedures: object } }) =>
	Object.entries(held._def.procedures) as [string, AnyProcedure][];

test('the root mounts each listed feature under its name, and nothing else', () => {
	assert.ok(sameRouter);
	assert.deepEqual(
		Object.keys(appRouter._def.record).sort(),
		routed.map((feature) => feature.name).sort()
	);
});

test('the procedures are the ones the hand-written root holds', () => {
	assert.deepEqual(
		Object.keys(appRouter._def.procedures).sort(),
		Object.keys(handWritten._def.procedures).sort()
	);
});

test("each procedure is its own feature's, one level below the root", () => {
	for (const [path, procedure] of proceduresOf(appRouter)) {
		const [name, ...rest] = path.split('.');
		const owner = routed.find((feature) => feature.name === name);

		assert.ok(owner, `${path} is under no feature`);
		assert.equal(
			Object.fromEntries(proceduresOf(owner.router))[rest.join('.')],
			procedure,
			`${path} is not ${name}'s`
		);
	}
});

test("no feature's router mounts another feature's router", () => {
	for (const feature of routed) {
		const own = new Set(proceduresOf(feature.router).map(([, procedure]) => procedure));

		for (const other of routed.filter((candidate) => candidate !== feature)) {
			const borrowed = proceduresOf(other.router).filter(([, procedure]) => own.has(procedure));

			assert.deepEqual(
				borrowed.map(([path]) => path),
				[],
				`${feature.name}'s router holds ${other.name}'s procedures`
			);
		}
	}
});
