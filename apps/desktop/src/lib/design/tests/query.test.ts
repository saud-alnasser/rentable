import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
	invalidateRoot,
	invalidateWorkspaceData,
	trustWorkspaceData,
	workspacePrefixes
} from '../query.ts';

function recordingClient() {
	const invalidated = [];
	const defaulted = [];

	return {
		invalidated,
		defaulted,
		invalidateQueries: async (filters) => {
			invalidated.push(filters?.queryKey ?? null);
		},
		setQueryDefaults: (queryKey, options) => {
			defaulted.push({ queryKey, options });
		}
	};
}

describe('the workspace query cache', () => {
	it('a data mutation invalidates every data-concept prefix', async () => {
		const client = recordingClient();

		await invalidateWorkspaceData(client);

		for (const prefix of Object.values(workspacePrefixes)) {
			assert.ok(
				client.invalidated.some((key) => JSON.stringify(key) === JSON.stringify(prefix)),
				`expected the ${JSON.stringify(prefix)} prefix to be invalidated`
			);
		}
	});

	it('a data mutation leaves the settings keys alone', async () => {
		const client = recordingClient();

		await invalidateWorkspaceData(client);

		for (const key of client.invalidated) {
			assert.notEqual(key?.[0], 'settings');
		}
	});

	it('a full-pass reconcile invalidates the root, unfiltered', async () => {
		const client = recordingClient();

		await invalidateRoot(client);

		assert.deepEqual(client.invalidated, [null]);
	});

	it('workspace data is cached until told otherwise', () => {
		const client = recordingClient();

		trustWorkspaceData(client);

		for (const prefix of Object.values(workspacePrefixes)) {
			const entry = client.defaulted.find(
				(candidate) => JSON.stringify(candidate.queryKey) === JSON.stringify(prefix)
			);

			assert.ok(entry, `expected a cache default for the ${JSON.stringify(prefix)} prefix`);
			assert.equal(entry.options.staleTime, Infinity);
		}
	});
});
