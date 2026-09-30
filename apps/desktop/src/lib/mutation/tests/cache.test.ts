import assert from 'node:assert/strict';
import { before, describe, it, mock } from 'node:test';

import type {
	DefaultError,
	InvalidateQueryFilters,
	OmitKeyof,
	QueryKey,
	QueryObserverOptions
} from '@tanstack/svelte-query';

import { features } from '$lib/app/features.ts';
import contract from '$lib/contract/feature.ts';
import {
	createCachePolicy,
	invalidateRoot,
	invalidateWorkspaceData,
	prefixOf,
	provideCachePolicy,
	sharedPrefix,
	trustWorkspaceData
} from '../cache.ts';

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

// what `$lib/app/cache` builds and provides as the root layout loads. It is built here rather than
// imported, because that module reaches the mutation handlers' toaster, which this file does not
// substitute.
const policy = createCachePolicy(features, contract);

// first, and before anything provides a policy: a read made too early is a failure, not an answer.
describe('a read before the policy is provided', () => {
	it('throws rather than answering with nothing', async () => {
		const early = /read before it was provided/;

		assert.throws(() => prefixOf('tenant'), early);
		assert.throws(() => sharedPrefix(), early);
		assert.throws(() => trustWorkspaceData(recordingClient()), early);
		await assert.rejects(invalidateWorkspaceData(recordingClient()), early);
	});
});

describe('the policy built from the declarations', () => {
	it('holds each declared prefix once, in the order the features are listed', () => {
		const declared = features.flatMap((feature) => ('prefix' in feature ? [feature.prefix] : []));

		assert.deepEqual(policy.prefixes, declared);
	});

	it("keys each record kind by its feature's prefix", () => {
		provideCachePolicy(policy);

		for (const feature of features) {
			if ('kind' in feature) {
				assert.deepEqual(prefixOf(feature.kind), feature.prefix);
			}
		}
	});

	it('keeps a key of no kind of its own under the prefix it was handed', () => {
		assert.deepEqual(policy.shared, contract.prefix);
	});
});

describe('the workspace query cache', () => {
	before(() => provideCachePolicy(policy));

	it('a data mutation invalidates every data-concept prefix', async () => {
		const client = recordingClient();

		await invalidateWorkspaceData(client);

		for (const prefix of policy.prefixes) {
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

		for (const prefix of policy.prefixes) {
			const entry = client.defaulted.find(
				(candidate) => JSON.stringify(candidate.queryKey) === JSON.stringify(prefix)
			);

			assert.ok(entry, `expected a cache default for the ${JSON.stringify(prefix)} prefix`);
			assert.equal(entry.options.staleTime, Infinity);
		}
	});
});
