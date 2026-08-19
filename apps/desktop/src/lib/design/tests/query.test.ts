import assert from 'node:assert/strict';
import { describe, it, mock } from 'node:test';

import type {
	DefaultError,
	InvalidateQueryFilters,
	OmitKeyof,
	QueryKey,
	QueryObserverOptions
} from '@tanstack/svelte-query';

import {
	invalidateRoot,
	invalidateWorkspaceData,
	trustWorkspaceData,
	workspacePrefixes
} from '../query.ts';

// `QueryClient` holds private state, so nothing assembled by hand is one — a recorder has to
// extend the class itself. The library reaches a `.svelte` file this harness cannot load, so
// the class comes from a substitute, which is all a recorder needs of it: what the writers
// under test call is overridden below, and the base is never asked for anything else.
mock.module('@tanstack/svelte-query', { exports: { QueryClient: class {} } });

const { QueryClient } = await import('@tanstack/svelte-query');

/** a client that answers nothing and remembers everything the writers asked it for. */
class RecordingClient extends QueryClient {
	/** the key of every invalidation, in order — `null` where the pass named none. */
	readonly invalidated: (QueryKey | null)[] = [];
	/** every cache default set, as the prefix it was set on and what was set. */
	readonly defaulted: { queryKey: QueryKey; options: { staleTime?: unknown } }[] = [];

	override async invalidateQueries(filters?: InvalidateQueryFilters): Promise<void> {
		this.invalidated.push(filters?.queryKey ?? null);
	}

	override setQueryDefaults<
		TQueryFnData = unknown,
		TError = DefaultError,
		TData = TQueryFnData,
		TQueryData = TQueryFnData
	>(
		queryKey: QueryKey,
		options: Partial<
			OmitKeyof<QueryObserverOptions<TQueryFnData, TError, TData, TQueryData>, 'queryKey'>
		>
	): void {
		this.defaulted.push({ queryKey, options });
	}
}

function recordingClient() {
	return new RecordingClient();
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
