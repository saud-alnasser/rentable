<script lang="ts">
	import type { SettingsSectionProps } from '$lib/feature/surface';
	import SettingsGrid from '@rentable/design/block/settings-grid.svelte';
	import SettingsGroup from '@rentable/design/block/settings-group.svelte';
	import SettingsRow from '@rentable/design/block/settings-row.svelte';
	import { Button } from '@rentable/design/primitive/button/index.js';
	import { Callout } from '@rentable/design/primitive/callout/index.js';
	import { tone } from '@rentable/design/tone.js';
	import { toErrorText } from '$lib/error/message';
	import { LL } from '$lib/i18n/i18n-svelte';
	import OrganizationAcceptOwnership from '$lib/organization/member/component/accept-ownership.svelte';
	import OrganizationChangePasswordDialog from '$lib/organization/session/component/change-password-dialog.svelte';
	import OrganizationIdentity from '$lib/organization/session/component/identity.svelte';
	import OrganizationMachines from '$lib/organization/session/component/machines.svelte';
	import { useAcceptOwnership } from '$lib/organization/member/query';
	import {
		useChangePassword,
		useEndMachine,
		useEndOtherSessions,
		useFetchMachines
	} from '$lib/organization/session/query';
	import { useFetchOrganizationState } from '$lib/organization/query';
	import { requestSignOut } from '$lib/sync';
	import CrownIcon from '@lucide/svelte/icons/crown';
	import KeyRoundIcon from '@lucide/svelte/icons/key-round';
	import LogOutIcon from '@lucide/svelte/icons/log-out';
	import MonitorIcon from '@lucide/svelte/icons/monitor';

	/**
	 * The settings area's account section: what a person reads about themselves, and the one
	 * offer that may be waiting on them. The organization contributes it (`surface.ts`), and the
	 * area draws it while somebody is signed in.
	 *
	 * **What it reads and writes is its own**, the way a record's section reads its records: the
	 * session, the password change, the acceptance, the machines and signing them out. *The
	 * settings route read them and handed the area a callback per act until effort 840, when the
	 * area stopped naming the organization.*
	 *
	 * **What the section is about, then what it holds.** *Settled by the human on the real
	 * organization.* It opens with the offer where one stands, because it is the one block here
	 * waiting on a reply.
	 *
	 * **It reads as sign-in and security** (effort 846, requirement 8): who is signed in, the
	 * password, the machines, and signing out of this one last, each a card in the section's grid
	 * in the manner of Apple's and Google's account pages (*Everything in a tab is a card*): the
	 * offer across both columns, who is signed in beside the password, then the machines and this
	 * machine across both, the list because it grows and the last because it ends something. Signing out of this machine moved here
	 * from beside the username, so the way out is the last thing the section holds.
	 */
	// what the area hands every section it draws. Nothing this section does lets go of the
	// organization, so it reads none of it; declared so the section is typed as one.
	// eslint-disable-next-line no-empty-pattern
	let {}: SettingsSectionProps = $props();

	const stateQuery = useFetchOrganizationState();
	const session = $derived(stateQuery.data?.session ?? null);

	const changePasswordMutation = useChangePassword();
	const acceptOwnershipMutation = useAcceptOwnership();
	const machinesQuery = useFetchMachines();
	const endMachine = useEndMachine();
	const endOtherSessions = useEndOtherSessions();

	let changingPassword = $state(false);
	/** what the shell refused the last change with, marked on the dialog's current-password field. */
	let passwordRefusal = $state<string | null>(null);

	/**
	 * the reader's own password, changed from this section.
	 *
	 * A change that went through closes the surface, which empties it: the two values on it are
	 * the ones that must not be left on screen. A refusal keeps it open with what was typed, and
	 * the sentence the shared handler already said in a toast is put back on the field it belongs
	 * to, because the current password is what the shell refuses this with
	 * ([[rules/interface]], *Validation errors*).
	 */
	const changePassword = async (current: string, next: string) => {
		passwordRefusal = null;

		try {
			await changePasswordMutation.mutateAsync({ current, next });
			changingPassword = false;
		} catch (error) {
			passwordRefusal = toErrorText(error, $LL);
		}
	};

	let acceptingOwnership = $state(false);
	/** what the shell refused the last acceptance with, marked on its password field. */
	let acceptRefusal = $state<string | null>(null);

	/**
	 * the organization, accepted from this section.
	 *
	 * The same shape again. The state is read again after it, because the reader's own role
	 * changed: they are the owner now, and the sections the area offers, the acts the cards carry
	 * and the rail's menus are all drawn off that. The surface closes because the offer it was
	 * drawn for is spent.
	 */
	const acceptOwnership = async (password: string) => {
		acceptRefusal = null;

		try {
			await acceptOwnershipMutation.mutateAsync({ password });
			await stateQuery.refetch();
			acceptingOwnership = false;
		} catch (error) {
			acceptRefusal = toErrorText(error, $LL);
		}
	};
</script>

{#snippet changePasswordAct()}
	<div>
		<!-- the verb's glyph before its label; outline rather than solid, since the act is
		     offered and never invited. -->
		<Button
			type="button"
			variant="outline"
			size="sm"
			data-change-password-open
			onclick={() => {
				passwordRefusal = null;
				changingPassword = true;
			}}
		>
			<KeyRoundIcon class="size-4" />
			{$LL.settings.you.password.change()}
		</Button>
	</div>
{/snippet}

{#snippet signOut()}
	<SettingsRow icon={LogOutIcon} name={$LL.settings.you.thisMachine.signOut()} tone="error">
		{#snippet control({ labelId })}
			<Button
				type="button"
				variant="ghost"
				size="sm"
				class="{tone({
					tone: 'error'
				}).text()} hover:bg-destructive/10 hover:text-destructive"
				aria-labelledby={labelId}
				data-sign-out-open
				onclick={requestSignOut}
			>
				<LogOutIcon class="size-4" />
				{$LL.common.actions.signOut()}
			</Button>
		{/snippet}
	</SettingsRow>
{/snippet}

{#if session}
	<!-- the reader's sign-in and security, in the order requirement 8 of effort 846 gives: the
	     offer where one stands, who is signed in beside the password, the machines, and the way
	     out of this one last. Each is a card in the section's grid, and each act that ends
	     something is drawn in the error tone at the end of its card (requirement 2). -->
	<SettingsGrid>
		<!-- the offer first, and only where one stands: it is the one thing in this section
		     waiting on the reader, and everything under it is a fact about their account that
		     will read the same tomorrow (requirement 22 of effort 828). A notice with its act,
		     across both columns, in the tone a notice takes, rather than a card of one row: it is
		     news, not a setting. *It stood last while it was the block most often absent; the
		     human read the four sections and asked for what is waiting to come first.* -->
		{#if session.ownershipOffered}
			<div data-ownership-offer class="col-span-full">
				<Callout tone="info" class="flex flex-wrap items-center gap-3 rounded-2xl p-4">
					<CrownIcon class="size-5 shrink-0" />
					<div class="flex min-w-0 flex-1 flex-col gap-0.5">
						<p class="font-semibold first-letter:uppercase">
							{$LL.settings.you.ownership.offeredBy({ owner: session.ownerUsername })}
						</p>
						<!-- the callout's own tone, not grey: grey on a tinted ground reads dead
						     (*Don't use grey text on colored backgrounds*). -->
						<p>{$LL.settings.you.ownership.consequence()}</p>
					</div>
					<!-- solid: the one act on this tab the reader is invited to take. -->
					<Button
						type="button"
						size="sm"
						data-accept-ownership-open
						onclick={() => {
							acceptRefusal = null;
							acceptingOwnership = true;
						}}
					>
						<CrownIcon class="size-4" />
						{$LL.organization.dashboard.acceptOwnership()}
					</Button>
				</Callout>
			</div>
		{/if}

		<OrganizationIdentity {session} />

		<!-- the fact, and the control that opens the write: nothing about the password is drawn
		     until the person asks to change it (requirement 8 of effort 828). The card is its
		     header and the one act at its foot, since a row named *password* under a card titled
		     password would say it twice. -->
		<div data-password class="contents">
			<SettingsGroup
				icon={KeyRoundIcon}
				title={$LL.settings.you.password.title()}
				description={$LL.settings.you.password.description()}
				footer={changePasswordAct}
			/>
		</div>

		<!-- every machine signed in as the reader, this one first, each other one signed out on its
		     row and all of them at the card's end (requirements 9 to 11). -->
		<OrganizationMachines
			machines={machinesQuery.data ?? []}
			onEndMachine={async (machineId) => {
				await endMachine.mutateAsync({ machineId });
			}}
			onEndOtherSessions={async () => {
				await endOtherSessions.mutateAsync();
			}}
		/>

		<!-- the way out of this machine, last and alone. It is not confirmed: signing in again
		     undoes it, and the organization stays on this machine (requirement 2; HIG, *Alerts*).
		     The shell owns the wall, so this asks and the shell signs out, as the rail's menu does. -->
		<div data-sign-out class="contents">
			<SettingsGroup
				icon={MonitorIcon}
				title={$LL.settings.you.thisMachine.title()}
				description={$LL.settings.you.thisMachine.description()}
				end={signOut}
				span="full"
			/>
		</div>
	</SettingsGrid>

	<OrganizationChangePasswordDialog
		open={changingPassword}
		onOpenChange={(open) => {
			changingPassword = open;

			if (!open) passwordRefusal = null;
		}}
		currentLabel={$LL.settings.you.password.currentLabel()}
		isChanging={changePasswordMutation.isPending}
		errorMessage={passwordRefusal}
		onChange={(current, next) => void changePassword(current, next)}
	/>

	<OrganizationAcceptOwnership
		open={acceptingOwnership}
		onOpenChange={(open) => {
			acceptingOwnership = open;

			if (!open) acceptRefusal = null;
		}}
		organizationName={session.organizationName}
		ownerUsername={session.ownerUsername}
		isAccepting={acceptOwnershipMutation.isPending}
		errorMessage={acceptRefusal}
		onAccept={(password) => void acceptOwnership(password)}
	/>
{/if}
