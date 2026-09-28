import assert from 'node:assert/strict';
import test from 'node:test';

import { router } from '$lib/api/trpc.ts';
import complex from '$lib/complex/router.ts';
import contract from '$lib/contract/router.ts';
import history from '$lib/history/router.ts';
import tenant from '$lib/tenant/router.ts';
import workspace from '$lib/workspace/router.ts';
import app from '../app.ts';
import { features } from '../features.ts';
import { appRouter } from '../router.ts';

/**
 * THE ROOT ROUTER IS BUILT FROM THE LIST
 *
 * Effort 840, criterion 3: the root mounts every feature's router under its name, and the typed
 * client inferred from it is the one the hand-written record it replaced gave.
 */

/** Whether two types are the same type, not merely assignable one to the other. */
type Same<A, B> =
	(<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;

const handWritten = router({ app, tenant, complex, contract, history, workspace });

// A compile-time check: `pnpm check` fails here if the list changes a procedure's path or type.
const sameRouter: Same<typeof appRouter._def.record, typeof handWritten._def.record> = true;

test('the root mounts each listed feature under its name, and nothing else', () => {
	assert.ok(sameRouter);
	assert.deepEqual(
		Object.keys(appRouter._def.record).sort(),
		features.map((feature) => feature.name).sort()
	);
});

test('the procedures are the ones the hand-written root held', () => {
	assert.deepEqual(
		Object.keys(appRouter._def.procedures).sort(),
		Object.keys(handWritten._def.procedures).sort()
	);
});
