<script lang="ts">
	import type { OrganizationSession, RemoteSyncState } from '$lib/platform/host';
	import { tauri } from '$lib/platform/tauri';
	import { Button } from '@rentable/design/primitive/button/index.js';
	import { Callout } from '@rentable/design/primitive/callout/index.js';
	import DetailDisclosure from '$lib/error/component/detail-disclosure.svelte';
	import * as Field from '@rentable/design/primitive/field/index.js';
	import { LL, locale } from '$lib/i18n/i18n-svelte';
	import { useAccountRefusalDetail } from '$lib/organization/query';
	import { TURSO_DASHBOARD_URL } from '$lib/organization/setup';
	import { useSyncWorkspace } from '$lib/settings/query';
	import { accountRefusalSentence } from '$lib/sync/refusal';
	import { syncFaultOf, syncStandingSentence, syncStatusOf } from '$lib/workspace/sync-status';
	import RefreshCwIcon from '@lucide/svelte/icons/refresh-cw';

	/**
	 * Where this machine stands with the organization on Turso, in one sentence, and a way to
	 * ask Turso now.
	 *
	 * **A legend and a sentence of purpose above the standing**, the shape every other block in
	 * the area has. The legend names the subject, the sentence says what the block is about and
	 * reads the same whatever the standing, and the standing is the block's description. *The
	 * standing stood alone as the block's first line until the human looked at it on the real
	 * organization and could not tell what the block was for.*
	 *
	 * **One sentence, built from the standing and the moment** (effort 828, requirement 25).
	 * `sync-status.ts` decides the standing and the order its answers are read in; this draws
	 * what it decided. Up to date says when this machine last reached Turso, relative within a
	 * day and as a date beyond it; a machine that never reached Turso says so rather than
	 * claiming to be up to date; a standing that needs something says what needs doing, and
	 * beneath it only what that standing calls for: the account refusal's sentence and the
	 * owner's dashboard control, the credential refusal's sentence, or the fault's own sentence.
	 * Then one quiet control, named "sync" since the human's second look on 2026-09-17. No badge,
	 * no status word standing alone, and the word "sync" on nothing but that control: a person
	 * reading this is asking whether their machine is reaching the organization, and "synced" in a
	 * coloured pill answered a different question, while the control is the one place the word is
	 * a thing to press. *The control read "check now" and the word was nowhere on the block.*
	 *
	 * **The reconnect stays in the Turso account block below.** The plan lists the reconnect
	 * beneath "this machine needs reconnecting" where the machine holds no authority, and that
	 * standing is a replica fault while the authority is the owner's consent, a different fact
	 * with a block of its own directly under this one. So where both hold, this points at that
	 * block in a sentence rather than drawing a second consent; where the machine holds no
	 * authority and the replica is fine, the block below says so and this says up to date,
	 * which is true of the replica.
	 *
	 * **It was `workspace/component/sync.svelte`, and it spoke of the workspace.** Its sentence
	 * read "this workspace is kept for you and reaches this machine on its own", beside a badge
	 * carrying one of four words and a button reading "sync". The block sits at the top of the
	 * organization section and is about the organization, so it moved here and the sentence
	 * about a workspace went with the badge. The history it carried is kept, because each turn
	 * removed something the next reader would otherwise put back:
	 *
	 * **A row, like every other block on the page**, which it was not until 2026-08-21. It was
	 * a bordered inset panel splitting into two columns at `lg`, the shape it had as a group on
	 * the settings page, carried across unchanged when the workspace got a page of its own, and
	 * the only section there that did not come from there.
	 *
	 * **What it stopped doing then is restating the page.** It drew an avatar and the
	 * workspace's name two sections below the block that draws both, and the signed-in account's
	 * name one section below the block that draws that account with its avatar, its username and
	 * its role. Its avatar was the account's initials where there was an account and the
	 * workspace's where there was not, so one circle stood for two different things depending on
	 * state.
	 *
	 * **And it said its sentence once.** Three strings carried it, a callout title, the first
	 * clause of that callout's description, and a third telling in the right-hand column, and
	 * the description ended "there is nothing to do here" directly above the button that does
	 * the thing.
	 */
	let {
		syncState,
		session = null,
		needsAuthority = false
	}: {
		syncState: RemoteSyncState;
		/** who is reading, for the one sentence that differs by reader (effort 819, requirement 25). */
		session?: OrganizationSession | null;
		/** an owner whose machine holds no Turso authority, whose reconnect is the block below. */
		needsAuthority?: boolean;
	} = $props();

	const syncWorkspaceMutation = useSyncWorkspace();

	const isChecking = $derived(syncWorkspaceMutation.isPending);
	const status = $derived(syncStatusOf(syncState));
	const fault = $derived(syncFaultOf(syncState));
	const isOwner = $derived(session?.role === 'owner');

	// the clock the relative moment is read against. A minute is the finest unit the sentence
	// says, so it moves once a minute and the sentence keeps up while the section is open; a
	// moment the heartbeat has just written reads as now until the next tick, which is right.
	let now = $state(Date.now());

	$effect(() => {
		const tick = window.setInterval(() => {
			now = Date.now();
		}, 60_000);

		return () => window.clearInterval(tick);
	});

	const sentence = $derived(
		syncStandingSentence(status, syncState.lastReachedAt, $locale, now, $LL)
	);

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

	async function checkNow() {
		try {
			await syncWorkspaceMutation.mutateAsync();
		} catch {
			/* ignore: the shared error handler has already said what went wrong. */
		}
	}
</script>

<!-- the shape every block in the area has: a legend, a sentence saying what the block is for,
     and then what it holds. The purpose sentence reads the same whatever the standing, so a
     person who came here worried learns what the block is about before they read the line
     that changes. The purpose is a description like every other block's, so it takes the same
     muted tone rather than the foreground the block's content reads in; the standing follows it,
     with the control at its end on the same row. *The standing stood alone as the block's first
     line until the human looked at it and could not tell what the block was for.* -->
<Field.Legend>{$LL.organization.standing.title()}</Field.Legend>
<Field.Description data-standing-purpose>{$LL.organization.standing.purpose()}</Field.Description>

<Field.Field orientation="responsive" data-standing={status}>
	<Field.Content>
		<Field.Description data-standing-sentence>{sentence}</Field.Description>
	</Field.Content>

	<div class="shrink-0">
		<!-- outline rather than solid, since the act is offered and never invited; the verb's
		     glyph before its label, as every control here carries one. -->
		<Button
			type="button"
			variant="outline"
			size="sm"
			data-check-now
			onclick={() => void checkNow()}
			disabled={isChecking}
		>
			<RefreshCwIcon class="size-4" />
			{isChecking ? $LL.organization.standing.checking() : $LL.organization.standing.checkNow()}
		</Button>
	</div>
</Field.Field>

<!-- beneath, only what the standing calls for. The account, refused by turso: said as the
     account's and never as a sync error, in the reader's own terms. A member is told whom to
     tell; the owner is told which limit and where on turso to go, and offered the dashboard,
     which is turso's own and spends nothing. Every read and write goes on being served from
     this machine meanwhile. -->
{#if accountRefusal}
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
				{$LL.organization.setup.openDashboard()}
			</Button>
		</div>
	{/if}
{:else if status === 'credentialRefused'}
	<!-- this member's credential, rotated by a lock-out and not yet replaced on this machine.
	     The application collects the re-sealed one on its own when the organization database is
	     reachable; if it does not clear, there is none to collect and the owner is who to ask. -->
	<Callout tone="warning" data-credential-refusal>{$LL.workspace.credentialRefused()}</Callout>
{:else if status === 'needsReconnect'}
	<!-- the fault, and only where there is one. What the service or the replica said is kept as
	     plain words with no code to read a sentence from, so the callout says the generic one in
	     the reader's language and the words themselves stay behind details, closed
	     ([[rules/interface]], *Error*). -->
	{#if fault}
		<Callout tone="error" data-fault>{$LL.common.messages.unexpectedError()}</Callout>
		<DetailDisclosure detail={fault} name="fault" />
	{/if}

	{#if needsAuthority}
		<Field.Description data-reconnect-below>
			{$LL.organization.standing.reconnectBelow()}
		</Field.Description>
	{/if}
{/if}
