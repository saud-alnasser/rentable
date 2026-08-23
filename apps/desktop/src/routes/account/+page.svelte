<script lang="ts">
	import PageFrame from '$lib/design/block/page-frame.svelte';
	import * as Field from '@rentable/design/primitive/field/index.js';
	import { LL } from '$lib/i18n/i18n-svelte';
	import { useFetchRemoteSyncState } from '$lib/settings/query';
	import SyncAccount from '$lib/sync/component/account.svelte';

	/**
	 * The person, as a page of its own.
	 *
	 * **One group, and that is not a page waiting to be filled.** Who this machine is signed in as
	 * and the way back out is the whole of what this application knows about a person: the name,
	 * the address and the picture are Google's, and there is nothing here to change. It is a page
	 * rather than a row on the settings page because it answers a different question, and because
	 * the account control in the sidebar needed somewhere to send a reader that was not the
	 * application's preferences.
	 *
	 * No loading branch: the shell renders past admission, and the startup path primes this
	 * query's key before it mounts. See `/workspace` for the same note at length.
	 */
	const remoteSyncQuery = useFetchRemoteSyncState();

	const syncState = $derived(remoteSyncQuery.data);
</script>

{#if syncState}
	<PageFrame>
		<h1 class="text-3xl font-semibold tracking-tight capitalize">{$LL.account.title()}</h1>

		<Field.Group>
			<Field.Set>
				<Field.Legend>{$LL.account.groupIdentity()}</Field.Legend>
				<SyncAccount {syncState} />
			</Field.Set>
		</Field.Group>
	</PageFrame>
{/if}
