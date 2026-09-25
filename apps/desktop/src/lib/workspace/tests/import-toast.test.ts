import assert from 'node:assert/strict';
import { beforeEach, it, mock } from 'node:test';

import { TRPCError } from '@trpc/server';

import { refuse } from '$lib/api/refusal.ts';
import { bindingOf } from '$lib/design/tests/testing.ts';

/**
 * AN IMPORT FAILURE IS SAID ONCE
 *
 * Ticket 41 of effort 832. A failed import reaches the reader through two paths: the declared
 * mutation's error handler, and the import dialog, which catches what `mutateAsync` rejects with and
 * raises it through `showErrorToast`. Both used to speak, so a permission failure, which the shared
 * handler raises whatever the declaration says, and an unexpected one were each toasted twice.
 *
 * The dialog is the one that speaks: it also raises what fails while the file is read, before any
 * mutation runs, so it is the path every failure already takes. This drives both paths the way a
 * failed import does and counts what reached the toast.
 */

const raised: string[] = [];

mock.module('svelte-sonner', {
	exports: {
		toast: {
			success: () => {},
			error: (message: string) => raised.push(message),
			warning: () => {},
			dismiss: () => {}
		}
	}
});

mock.module('@tanstack/svelte-query', {
	exports: {
		useQueryClient: () => ({ invalidateQueries: async () => {} }),
		createMutation: (options: () => unknown) => options()
	}
});

// the procedure is never called here, so the caller is an empty stand-in.
mock.module('$lib/api/caller', { exports: { default: {} } });

// a failure is recorded for diagnostics; what it records is not asserted here.
mock.module('$lib/platform/tauri', {
	exports: { tauri: { diagnostics: { write: async () => {} } } }
});

const { useImportRecords } = await import('$lib/workspace/query');
const { showErrorToast } = await import('$lib/error/toast');
const { loadLocale } = await import('$lib/i18n/i18n-util.sync');
const { LL, setLocale } = await import('$lib/i18n/i18n-svelte');
const { get } = await import('svelte/store');

loadLocale('en');
setLocale('en');

beforeEach(() => {
	raised.length = 0;
});

/** what a failed import does: the mutation's handler runs, then the dialog catches the rejection. */
function failImport(failure: Error) {
	bindingOf(useImportRecords).onError(failure);
	showErrorToast(failure, get(LL));
}

it('says an import refused for permission once', () => {
	for (const failure of [
		new TRPCError({ code: 'FORBIDDEN', message: 'this account does not hold importRecords' }),
		new TRPCError({ code: 'UNAUTHORIZED', message: 'no account is signed in on this machine' })
	]) {
		raised.length = 0;
		failImport(failure);

		assert.equal(raised.length, 1, `${failure.code} was said ${raised.length} times`);
	}

	assert.deepEqual(raised, ['sign in to do this.']);
});

it('says an unexpected import failure once', () => {
	failImport(new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'SQLITE_BUSY' }));

	assert.deepEqual(raised, [get(LL).common.messages.unexpectedError()]);
});

it('says an import refusal once', () => {
	failImport(refuse('contract.tenantMissing'));

	assert.equal(raised.length, 1);
});
