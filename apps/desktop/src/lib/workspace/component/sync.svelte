<script lang="ts">
	import type { RemoteSyncState } from '$lib/platform/host';
	import { Badge } from '@rentable/design/primitive/badge/index.js';
	import { Button } from '@rentable/design/primitive/button/index.js';
	import { Callout } from '@rentable/design/primitive/callout/index.js';
	import * as Field from '@rentable/design/primitive/field/index.js';
	import { LL } from '$lib/i18n/i18n-svelte';
	import { useSyncWorkspace } from '$lib/settings/query';
	import {
		syncFaultOf,
		syncStatusLabel,
		syncStatusOf,
		syncStatusVariant
	} from '$lib/workspace/sync-status';
	import RefreshCwIcon from '@lucide/svelte/icons/refresh-cw';

	/**
	 * Whether this machine is reaching its workspace, and a way to make it check now.
	 *
	 * **A row, like every other section on this page**, which it was not until 2026-08-21. It was
	 * a bordered inset panel splitting into two columns at `lg` — the shape it had as a group on
	 * the settings page, carried across unchanged when the workspace got a page of its own, and
	 * the only section here that did not come from here.
	 *
	 * **What it stopped doing is restating the page.** It drew an avatar and the workspace's name
	 * two sections below `identity.svelte`, which draws both, and the signed-in account's email
	 * one section below `members.svelte`, which draws that account with its picture, its name and
	 * its role. Its avatar was the account's initials where there was an account and the
	 * workspace's where there was not, so one circle stood for two different things depending on
	 * state.
	 *
	 * **And it said its sentence once.** Three strings carried it — a callout title, the first
	 * clause of that callout's description, and a third telling in the right-hand column — and the
	 * description ended *there is nothing to do here* directly above the button that does the
	 * thing.
	 *
	 * The status is `sync-status.ts`'s, because the order of its answers is a decision and a runes
	 * file cannot be imported by the test harness.
	 */
	let { syncState }: { syncState: RemoteSyncState } = $props();

	const syncWorkspaceMutation = useSyncWorkspace();

	const isSyncing = $derived(syncWorkspaceMutation.isPending);
	const status = $derived(syncStatusOf(syncState));
	const fault = $derived(syncFaultOf(syncState));

	async function syncNow() {
		try {
			await syncWorkspaceMutation.mutateAsync();
		} catch {
			/* ignore: the shared error handler has already said what went wrong. */
		}
	}
</script>

<div class="space-y-4">
	<Field.Field orientation="responsive">
		<Field.Content>
			<Field.Description>{$LL.workspace.syncDescription()}</Field.Description>
		</Field.Content>

		<div class="flex shrink-0 items-center gap-2">
			<Badge variant={syncStatusVariant(status)}>{syncStatusLabel(status, $LL)}</Badge>
			<Button variant="outline" size="sm" onclick={() => void syncNow()} disabled={isSyncing}>
				<RefreshCwIcon class="size-4 shrink-0" />
				{isSyncing ? $LL.common.actions.working() : $LL.common.actions.syncNow()}
			</Button>
		</div>
	</Field.Field>

	<!-- the fault itself, and only where there is one. The badge says *that* something is wrong in
	     a word; this is the sentence the service or the replica gave, which is the half a person
	     can act on. It stays a callout rather than joining the row because it is somebody else's
	     text and can be any length. -->
	{#if fault}
		<Callout tone="error">{fault}</Callout>
	{/if}
</div>
