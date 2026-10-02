<script lang="ts">
	import type { RemoteSyncState, SyncStatus } from '$lib/sync';
	import type { OrganizationSession } from '$lib/organization/host';
	import type { Component } from 'svelte';
	import { tauri } from '$lib/platform/tauri';
	import SettingsGroup from '@rentable/design/block/settings-group.svelte';
	import SettingsRow from '@rentable/design/block/settings-row.svelte';
	import { Button } from '@rentable/design/primitive/button/index.js';
	import { Callout } from '@rentable/design/primitive/callout/index.js';
	import DetailDisclosure from '$lib/error/component/detail-disclosure.svelte';
	import { LL, locale } from '$lib/i18n/i18n-svelte';
	import { useAccountRefusalDetail } from '$lib/organization/query';
	import { TURSO_DASHBOARD_URL } from '$lib/organization/setup/setup';
	import { syncActivity, useSyncWorkspace } from '$lib/sync/ui';
	import { accountRefusalSentence } from '$lib/error/refusal';
	import {
		SYNC_STATUS_TONE,
		syncFaultOf,
		syncLastReachedLine,
		syncProblemOf,
		syncStatusOf,
		syncStatusWord
	} from '$lib/sync';
	import CircleCheckIcon from '@lucide/svelte/icons/circle-check';
	import CloudIcon from '@lucide/svelte/icons/cloud';
	import CloudOffIcon from '@lucide/svelte/icons/cloud-off';
	import ExternalLinkIcon from '@lucide/svelte/icons/external-link';
	import OctagonXIcon from '@lucide/svelte/icons/octagon-x';
	import RefreshCwIcon from '@lucide/svelte/icons/refresh-cw';
	import TriangleAlertIcon from '@lucide/svelte/icons/triangle-alert';

	/**
	 * Where this machine stands with the organization on Turso, at a glance, and a way to ask
	 * Turso now: the organization section's sync group.
	 *
	 * **One state row, on the settings group** (effort 846, requirement 12). The state is one of
	 * five, each a glyph and a word in a tone of its own, in the manner of Apple's iCloud pane,
	 * which marks its state with a coloured status and names it: up to date, syncing, not yet
	 * reached, needs attention, needs reconnecting. `sync/status.ts` decides which, and the order
	 * its answers are read in; this draws what it decided. Under the word, on a line of its own,
	 * when this machine last reached Turso, whenever it has; at the row's end the one control,
	 * named "sync" since the human's second look on 2026-09-17. *Effort 828, requirement 25, had
	 * retired the coloured word for one muted sentence, and nothing showed at a glance whether
	 * sync was healthy; the human brought it back on 2026-10-02.*
	 *
	 * **The syncing glyph stands still.** A turning glyph is a spinner, and a spinner says only
	 * that something is happening ([[rules/interface]], *Loading*); the word says it, and the tone
	 * marks it, and nothing on the page moves for a run the heartbeat starts every five minutes.
	 *
	 * **A card across both columns, its state one `settings-row` reporting it** (effort 846,
	 * *Everything in a tab is a card*): the row's glyph and name take the state's tone
	 * (`reports`), the last reach is the line under its name, *sync* is its control, and a
	 * problem keeps the explanation and the act it offers beneath it, under the state rather than
	 * instead of it, never folded. What does fold, behind the chevron, is the machine's own detail:
	 * the workspace it keeps a copy of and where the copy is, which nobody acts on and a person
	 * reads out to somebody helping them (*Detail that few readers need folds under its row*).
	 * *The row was built by hand from the item primitive until then, the one row in the area that
	 * was not a `settings-row`.*
	 *
	 * **Beneath the state, only what the problem calls for**: the account refusal's sentence and
	 * the owner's dashboard control, the credential refusal's sentence, or the fault's own
	 * sentence with what was said behind a disclosure.
	 *
	 * **The reconnect stays in the Turso account group below.** "Needs reconnecting" is a replica
	 * fault, while the authority is the owner's consent, a different fact with a group of its own
	 * directly under this one. So where both hold, this points at that group in a sentence rather
	 * than drawing a second consent; where the machine holds no authority and the replica is fine,
	 * the group below says so and this says up to date, which is true of the replica.
	 *
	 * *It was `workspace/component/sync.svelte`, a badge and a button that spoke of the workspace;
	 * then a bordered inset panel; then a row like every block on the page (2026-08-21); then one
	 * sentence (effort 828). The group is about the organization, and says nothing a block beside
	 * it already draws: no avatar, no workspace name, no account.*
	 */
	let {
		syncState,
		session = null,
		needsAuthority = false
	}: {
		syncState: RemoteSyncState;
		/** who is reading, for the one sentence that differs by reader (effort 819, requirement 25). */
		session?: OrganizationSession | null;
		/** an owner whose machine holds no Turso authority, whose reconnect is the group below. */
		needsAuthority?: boolean;
	} = $props();

	/** each state's glyph, beside its tone in `sync/status.ts`: the plan's table, in pictures. */
	const GLYPH: Record<SyncStatus, Component<{ class?: string }>> = {
		upToDate: CircleCheckIcon,
		syncing: RefreshCwIcon,
		notYetReached: CloudOffIcon,
		needsAttention: TriangleAlertIcon,
		needsReconnecting: OctagonXIcon
	};

	const syncWorkspaceMutation = useSyncWorkspace();

	const isChecking = $derived(syncWorkspaceMutation.isPending || syncActivity.inFlight);
	const status = $derived(syncStatusOf(syncState, syncActivity.inFlight));
	const problem = $derived(syncProblemOf(syncState));
	const fault = $derived(syncFaultOf(syncState));
	const isOwner = $derived(session?.role === 'owner');

	const tone = $derived(SYNC_STATUS_TONE[status]);
	const Glyph = $derived(GLYPH[status]);

	// the clock the relative moment is read against. A minute is the finest unit the line says,
	// so it moves once a minute and the line keeps up while the section is open; a moment the
	// heartbeat has just written reads as now until the next tick, which is right.
	let now = $state(Date.now());

	$effect(() => {
		const tick = window.setInterval(() => {
			now = Date.now();
		}, 60_000);

		return () => window.clearInterval(tick);
	});

	const lastReached = $derived(syncLastReachedLine(syncState.lastReachedAt, $locale, now, $LL));

	// Turso's sentence, read by the owner's machine alone and only while a refusal stands.
	const refusalDetail = useAccountRefusalDetail(() => problem === 'accountRefused' && isOwner);

	const accountRefusal = $derived(
		problem === 'accountRefused'
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

	const beneath = $derived(
		problem === 'accountRefused' ||
			problem === 'credentialRefused' ||
			(problem === 'needsReconnect' && (fault !== null || needsAuthority))
	);

	async function checkNow() {
		try {
			await syncWorkspaceMutation.mutateAsync();
		} catch {
			/* ignore: the shared error handler has already said what went wrong. */
		}
	}
</script>

<!-- what folds under the state: the workspace this machine keeps a copy of, and where the copy is.
     Nobody acts on either, and both are what a person reads out to somebody helping them. -->
{#snippet machineDetail()}
	<dl class="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1" data-standing-detail>
		<dt>{$LL.organization.standing.detail.workspace()}</dt>
		<dd class="min-w-0 text-foreground"><bdi>{syncState.workspace.name}</bdi></dd>
		<dt>{$LL.organization.standing.detail.copy()}</dt>
		<dd class="min-w-0 text-xs break-all">
			<bdi dir="ltr">{syncState.workspace.localDatabasePath}</bdi>
		</dd>
	</dl>
{/snippet}

{#snippet lastReachedLine()}
	<span data-last-reached>{lastReached}</span>
{/snippet}

{#snippet checkNowControl()}
	<!-- outline rather than solid, since the act is offered and never invited; the verb's glyph
	     before its label, as every control here carries one. -->
	<Button
		type="button"
		variant="outline"
		size="sm"
		data-check-now
		onclick={() => void checkNow()}
		disabled={isChecking}
	>
		<RefreshCwIcon class="size-4" />
		{$LL.organization.standing.checkNow()}
	</Button>
{/snippet}

<!-- beneath the state, only what its problem calls for, inside the row it explains, and never
     folded: a problem is read where the state is. -->
{#snippet problemBeneath()}
	<div class="flex flex-col gap-2" data-standing-beneath>
		{#if accountRefusal}
			<!-- the account, refused by turso: said as the account's and never as a sync error, in
			     the reader's own terms. A member is told whom to tell; the owner is told which limit
			     and where on turso to go, and offered the dashboard, which is turso's own and spends
			     nothing. -->
			<Callout tone="warning" data-account-refusal={isOwner ? 'owner' : 'member'}>
				{accountRefusal}
			</Callout>
			{#if isOwner}
				<div>
					<Button
						type="button"
						variant="outline"
						size="sm"
						data-open-dashboard
						onclick={() => void tauri.opener.openUrl(TURSO_DASHBOARD_URL)}
					>
						<ExternalLinkIcon class="size-4" />
						{$LL.organization.setup.openDashboard()}
					</Button>
				</div>
			{/if}
		{:else if problem === 'credentialRefused'}
			<!-- this member's credential, rotated by a lock-out and not yet replaced on this machine.
			     The application collects the re-sealed one on its own when the organization database
			     is reachable; if it does not clear, there is none to collect and the owner is who to
			     ask. -->
			<Callout tone="warning" data-credential-refusal>
				{$LL.workspace.credentialRefused()}
			</Callout>
		{:else if problem === 'needsReconnect'}
			<!-- the fault, and only where there is one. What the service or the replica said is kept
			     as plain words with no code to read a sentence from, so the callout says the generic
			     one in the reader's language and the words stay behind details, closed
			     ([[rules/interface]], *Error*). -->
			{#if fault}
				<Callout tone="error" data-fault>{$LL.common.messages.unexpectedError()}</Callout>
				<DetailDisclosure detail={fault} name="fault" />
			{/if}

			{#if needsAuthority}
				<p class="text-sm text-muted-foreground" data-reconnect-below>
					{$LL.organization.standing.reconnectBelow()}
				</p>
			{/if}
		{/if}
	</div>
{/snippet}

<SettingsGroup
	icon={CloudIcon}
	title={$LL.organization.standing.title()}
	description={$LL.organization.standing.purpose()}
	span="full"
>
	{#snippet rows()}
		<SettingsRow
			icon={Glyph}
			name={syncStatusWord(status, $LL)}
			reports={tone}
			meta={lastReached ? lastReachedLine : undefined}
			control={checkNowControl}
			beneath={beneath ? problemBeneath : undefined}
			details={machineDetail}
			detailsLabel={$LL.organization.standing.detail.label()}
			detailsKey="organization.standing.detail"
			data-standing={status}
			data-standing-tone={tone}
		/>
	{/snippet}
</SettingsGroup>
