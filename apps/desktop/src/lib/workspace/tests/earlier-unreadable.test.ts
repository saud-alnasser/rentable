import assert from 'node:assert/strict';
import { mock, test } from 'node:test';

// An `app.db` that cannot be read offers nothing on the way in, and says so to the diagnostics
// under an event name spelled as the rest of the application's are (`area.what`).
type Recorded = { event: string; fields: Record<string, unknown> };

const recorded: Recorded[] = [];

mock.module('$lib/platform/diagnostics', {
	exports: {
		recordDiagnosticWarning: (event: string, fields: Record<string, unknown>) => {
			recorded.push({ event, fields });
		}
	}
});

mock.module('$lib/platform/tauri', {
	exports: {
		tauri: {
			earlier: {
				find: async () => {
					throw new Error('file is not a database');
				}
			}
		}
	}
});

// svelte-query and what the settings query reaches load `.svelte` files, which this harness
// cannot, and the query around the read is not what is under test here.
mock.module('@tanstack/svelte-query', {
	exports: { createQuery: () => ({}), useQueryClient: () => ({}) }
});
mock.module('$lib/api/caller', { defaultExport: {} });
mock.module('$lib/settings/query', { exports: { keys: { settings: ['settings'] } } });

const { findEarlierRecords } = await import('../earlier.ts');

test('an unreadable earlier file offers nothing and is recorded as earlier.unreadable', async () => {
	assert.equal(await findEarlierRecords(), null);
	assert.deepEqual(recorded, [
		{ event: 'earlier.unreadable', fields: { reason: 'file is not a database' } }
	]);
});
