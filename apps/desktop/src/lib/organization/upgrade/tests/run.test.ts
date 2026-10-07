import assert from 'node:assert/strict';
import { beforeEach, describe, it, mock } from 'node:test';

/**
 * UPGRADE NOW REPORTS THROUGH THE USUAL OUTCOME
 *
 * Ticket 08 of [[efforts/857-updating-never-locks-a-member-out/spec]]: running an upgrade is a
 * write to the organization like any other, so it speaks through the shared handlers, its success
 * named for what was upgraded and a refusal as its sentence, and it reads again what waits and
 * where the organization stands, which takes the mark off and lets every capability waiting on
 * the step run.
 *
 * The dependencies are substituted for the reason `organization/tests/refresh.test.ts` gives, and
 * the toaster's substitute records what it was asked to say.
 */

const said: string[] = [];

mock.module('svelte-sonner', {
	exports: {
		toast: {
			success: (message: string) => said.push(`success:${message}`),
			error: (message: string) => said.push(`error:${message}`),
			warning: () => undefined,
			dismiss: () => undefined
		}
	}
});

/** the query keys the client was asked to invalidate, newest last. */
const invalidated: string[] = [];

mock.module('@tanstack/svelte-query', {
	exports: {
		useQueryClient: () => ({
			invalidateQueries: async (filters?: { queryKey?: readonly unknown[] }) => {
				invalidated.push(JSON.stringify(filters?.queryKey ?? null));
			},
			setQueryData: () => undefined
		}),
		createQuery: (options: () => unknown) => options(),
		createMutation: (options: () => unknown) => options()
	}
});

const ran: unknown[] = [];

mock.module('$lib/api/caller', {
	exports: {
		default: {
			organization: {
				upgrade: {
					run: async (input: unknown) => {
						ran.push(input);
					}
				}
			}
		},
		forgetContext: () => undefined
	}
});

mock.module('$lib/platform/tauri', {
	exports: { tauri: { diagnostics: { write: async () => {} } } }
});

const { useRunUpgrade, keys } = await import('$lib/organization/upgrade/query');
const { keys: organizationKeys } = await import('$lib/organization/query');
const { bindingOf } = await import('#tests/mutation.ts');
const { loadLocale } = await import('$lib/i18n/i18n-util.sync');
const { setLocale } = await import('$lib/i18n/i18n-svelte');
const { default: en } = await import('$lib/i18n/en');

loadLocale('en');
setLocale('en');

beforeEach(() => {
	said.length = 0;
	invalidated.length = 0;
	ran.length = 0;
});

describe('upgrade now', () => {
	it('runs the target alone, says what was upgraded, and reads what waits and the organization again', async () => {
		const mutation = bindingOf(useRunUpgrade);
		const variables = { target: { workspace: 'north' }, name: 'North' };

		await mutation.mutationFn(variables);
		await mutation.onSuccess(undefined, variables, undefined);

		assert.deepEqual(ran, [{ target: { workspace: 'north' } }]);
		assert.deepEqual(said, ['success:North was upgraded.']);
		assert.deepEqual(invalidated, [
			JSON.stringify(keys.awaiting),
			...[organizationKeys.members, organizationKeys.roles, organizationKeys.state].map((key) =>
				JSON.stringify(key)
			)
		]);
	});

	it('names the organization when it is what was upgraded', async () => {
		const mutation = bindingOf(useRunUpgrade);

		await mutation.onSuccess(undefined, { target: 'organization', name: '' }, undefined);

		assert.deepEqual(said, [`success:${en.organization.upgrade.upgradedOrganization}`]);
	});

	it('says a refusal as its sentence, and reads nothing again', async () => {
		const mutation = bindingOf(useRunUpgrade);

		await mutation.onError(
			Object.assign(new Error('refused'), { kind: 'refused', reason: 'upgradeNeedsOwner' }),
			{ target: 'organization', name: '' },
			undefined
		);

		assert.equal(said.length, 1);
		assert.ok(said[0].startsWith('error:'), said[0]);
		assert.deepEqual(invalidated, []);
	});

	it('keeps what waits under the state, so whatever reads the state again reads it too', () => {
		assert.deepEqual(keys.awaiting.slice(0, organizationKeys.state.length), [
			...organizationKeys.state
		]);
	});
});
