<script lang="ts">
	import type { OrganizationSession, RemoteSyncState } from '$lib/platform/host';
	import { tauri } from '$lib/platform/tauri';
	import { Badge } from '@rentable/design/primitive/badge/index.js';
	import { Button } from '@rentable/design/primitive/button/index.js';
	import { Callout } from '@rentable/design/primitive/callout/index.js';
	import * as Field from '@rentable/design/primitive/field/index.js';
	import { LL } from '$lib/i18n/i18n-svelte';
	import { useAccountRefusalDetail } from '$lib/organization/query';
	import { TURSO_DASHBOARD_URL } from '$lib/organization/setup';
	import { useSyncWorkspace } from '$lib/settings/query';
	import { accountRefusalSentence } from '$lib/sync/refusal';
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
	 * two sections below `identity.svelte`, which draws both, and the signed-in account's name
	 * one section below `members.svelte`, which draws that account with its avatar, its username
	 * and its role. *This said the account's email; an account is a username since effort 824.* Its avatar was the account's initials where there was an account and the
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
	let {
		syncState,
		session = null
	}: {
		syncState: RemoteSyncState;
		/** who is reading, for the one sentence that differs by reader (requirement 25). */
		session?: OrganizationSession | null;
	} = $props();

	const syncWorkspaceMutation = useSyncWorkspace();

	const isSyncing = $derived(syncWorkspaceMutation.isPending);
	const status = $derived(syncStatusOf(syncState));
	const fault = $derived(syncFaultOf(syncState));
	const isOwner = $derived(session?.role === 'owner');

	// Turso's sentence, read by the owner's machine alone and only while a refusal stands.
	const refusalDetail = useAccountRefusalDetail(() => status === 'accountRefused' && isOwner);

	const accountRefusal = $derived(
		status === 'accountRefused'
			? accountRefusalSentence(
					{
						isOwner,
						ownerUsername: session?.ownerUsername ?? '',
						detail: isOwner ? (refusalDetail.data ?? null) : null
					},
					$LL
				)
			: null
	);

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

	<!-- the account, refused by turso: said as the account's and never as a sync error, in the
	     reader's own terms. A member is told whom to tell; the owner is told which limit and where
	     on turso to go, and offered the dashboard, which is turso's own and spends nothing.
	     Every read and write goes on being served from this machine meanwhile. -->
	{#if accountRefusal}
		<Callout tone="warning" data-account-refusal={isOwner ? 'owner' : 'member'}>
			{accountRefusal}
		</Callout>
		{#if isOwner}
			<Button
				variant="outline"
				size="sm"
				onclick={() => void tauri.opener.openUrl(TURSO_DASHBOARD_URL)}
			>
				{$LL.organization.setup.openDashboard()}
			</Button>
		{/if}
	{:else if status === 'credentialRefused'}
		<!-- this member's credential, rotated by a lock-out and not yet replaced on this machine.
		     The application collects the re-sealed one on its own when the organization database is
		     reachable; if it does not clear, there is none to collect and the owner is who to ask. -->
		<Callout tone="warning" data-credential-refusal>{$LL.workspace.credentialRefused()}</Callout>
	{:else if fault}
		<!-- the fault itself, and only where there is one. The badge says *that* something is wrong
		     in a word; this is the sentence the service or the replica gave, which is the half a
		     person can act on. It stays a callout rather than joining the row because it is
		     somebody else's text and can be any length. -->
		<Callout tone="error">{fault}</Callout>
	{/if}
</div>
