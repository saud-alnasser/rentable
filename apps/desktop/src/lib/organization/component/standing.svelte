<script lang="ts">
	import type { RemoteSyncState, SyncStatus } from '$lib/sync';
	import type { OrganizationSession } from '$lib/organization/host';
	import type { Component } from 'svelte';
	import { tauri } from '$lib/platform/tauri';
	import ConfirmDialog from '@rentable/design/block/confirm-dialog.svelte';
	import SettingsGroup from '@rentable/design/block/settings-group.svelte';
	import SettingsRow from '@rentable/design/block/settings-row.svelte';
	import { Button } from '@rentable/design/primitive/button/index.js';
	import { Callout } from '@rentable/design/primitive/callout/index.js';
	import { tone as toneOf } from '@rentable/design/tone.js';
	import * as Tooltip from '@rentable/design/primitive/tooltip/index.js';
	import { reducesMotion } from '@rentable/design/reduces-motion.js';
	import DetailDisclosure from '$lib/error/component/detail-disclosure.svelte';
	import { LL, locale } from '$lib/i18n/i18n-svelte';
	import { useAccountRefusalDetail } from '$lib/organization/query';
	import { TURSO_DASHBOARD_URL } from '$lib/organization/setup/setup';
	import { syncActivity, useDiscardUnsent, useSyncWorkspace } from '$lib/sync/ui';
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
	import CloudSyncIcon from '@lucide/svelte/icons/cloud-sync';
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
	 * named "sync" since the human's second look on 2026-09-17, an icon control named by its
	 * tooltip since ticket 38 ("the sync button should be the icon only with tooltip maybe"). *Effort 828, requirement 25, had
	 * retired the coloured word for one muted sentence, and nothing showed at a glance whether
	 * sync was healthy; the human brought it back on 2026-10-02.*
	 *
	 * **The state's glyph stands still, and the control's turns.** The syncing state is a cloud
	 * with its arrows (`cloud-sync`), which holds still: the word says it, the tone marks it, and a
	 * state is not a spinner ([[rules/interface]], *Loading*). The control's own glyph, the
	 * arrows (`refresh-cw`), turns while a run is in flight, whoever started it, and the control is
	 * `aria-busy` for as long, as the update check's does (ticket 34); a reader who asked for less
	 * motion gets the same busy control with a glyph that holds still. The state's glyph is never
	 * the control's: a button repeating its row's glyph says the row twice (ticket 38). *The
	 * syncing state was the control's `refresh-cw` until then.*
	 *
	 * **A card, its state one `settings-row` reporting it** (effort 846,
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
	 * the owner's dashboard control, the credential refusal's sentence, the held changes' sentence
	 * and the act that discards them, or the fault's own sentence with what was said behind a
	 * disclosure.
	 *
	 * **Changes an upgrade made unsendable are the person's to decide** (effort 857, ticket 13).
	 * The sentence says they are kept and that the workspace waits; keeping them is doing nothing,
	 * so the one act is to discard them, a quiet button in the error tone, words with no glyph, as
	 * an act that ends something is drawn (*A dangerous act that looks benign*). It asks first, in
	 * the design package's confirm dialog named for the act, whose way out keeps them; only a yes
	 * reaches the shell.
	 *
	 * **The reconnect stays on the Turso account's row, in the leaving card.** "Needs
	 * reconnecting" is a replica fault, while the authority is the owner's consent, a different
	 * fact with a row of its own (ticket 38 folded the Turso account card into leaving). So where
	 * both hold, this points at that row in a sentence rather than drawing a second consent; where
	 * the machine holds no authority and the replica is fine, that row says so and this says up to
	 * date, which is true of the replica.
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
		/** an owner whose machine holds no Turso authority, whose reconnect is in the leaving card. */
		needsAuthority?: boolean;
	} = $props();

	/** each state's glyph, beside its tone in `sync/status.ts`: the plan's table, in pictures. */
	const GLYPH: Record<SyncStatus, Component<{ class?: string }>> = {
		upToDate: CircleCheckIcon,
		syncing: CloudSyncIcon,
		notYetReached: CloudOffIcon,
		needsAttention: TriangleAlertIcon,
		needsReconnecting: OctagonXIcon
	};

	const syncWorkspaceMutation = useSyncWorkspace();
	const discardUnsentMutation = useDiscardUnsent();

	/** whether the question before discarding the held changes is open. */
	let discarding = $state(false);

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
			problem === 'changesUnsendable' ||
			(problem === 'needsReconnect' && (fault !== null || needsAuthority))
	);

	/** the reader asked for less motion, read as a run is asked for, so the glyph holds still. */
	let holdsStill = $state(reducesMotion());

	/** the control's name, which says what it is doing while it does it. */
	const checkLabel = $derived(
		isChecking ? syncStatusWord('syncing', $LL) : $LL.organization.standing.checkNow()
	);

	async function checkNow() {
		holdsStill = reducesMotion();

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
	<!-- an icon control named by its tooltip and its accessible name alike, outline since the act
	     is offered and never invited. Its glyph turns while a run is in flight, as the spinner
	     turns; still where the reader asked for less motion, and the media query holds it still
	     should they ask while it turns. -->
	<Tooltip.Root>
		<Tooltip.Trigger>
			{#snippet child({ props })}
				<Button
					{...props}
					type="button"
					variant="outline"
					size="icon-sm"
					aria-label={checkLabel}
					aria-busy={isChecking}
					data-check-now
					onclick={() => void checkNow()}
					disabled={isChecking}
				>
					<RefreshCwIcon
						class="size-4 {isChecking && !holdsStill
							? 'animate-spin motion-reduce:animate-none'
							: ''}"
						data-check-now-glyph
					/>
				</Button>
			{/snippet}
		</Tooltip.Trigger>
		<Tooltip.Content side="top" sideOffset={8} data-check-now-hint>
			{checkLabel}
		</Tooltip.Content>
	</Tooltip.Root>
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
		{:else if problem === 'changesUnsendable'}
			<!-- changes this machine had not sent when an upgrade removed what they name: kept until
			     the person discards them, and the workspace waits until then. The act asks first. -->
			<Callout tone="warning" data-unsendable>
				{$LL.organization.standing.unsendable.sentence()}
			</Callout>
			<div>
				<Button
					type="button"
					variant="ghost"
					size="sm"
					class="{toneOf({
						tone: 'error'
					}).text()} hover:bg-destructive/10 hover:text-destructive"
					data-discard-unsent
					onclick={() => (discarding = true)}
				>
					{$LL.organization.standing.unsendable.discard()}
				</Button>
			</div>
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
				<p class="text-sm text-muted-foreground" data-reconnect-pointer>
					{$LL.organization.standing.reconnectOnAccount()}
				</p>
			{/if}
		{/if}
	</div>
{/snippet}

<!-- the question before the held changes go: the workspace they belong to leads it, what goes and
     that it cannot be undone follow, and leaving keeps them. -->
<ConfirmDialog
	open={discarding}
	onOpenChange={(open) => (discarding = open)}
	onSubmit={async () => {
		await discardUnsentMutation.mutateAsync();
	}}
	record={syncState.workspace.name}
	title={$LL.organization.standing.unsendable.confirmTitle()}
	description={$LL.organization.standing.unsendable.confirmDescription()}
	confirmLabel={$LL.organization.standing.unsendable.confirm()}
	confirmLoadingLabel={$LL.organization.standing.unsendable.confirming()}
/>

<SettingsGroup
	icon={CloudIcon}
	title={$LL.organization.standing.title()}
	description={$LL.organization.standing.purpose()}
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
