<script lang="ts">
	import type { HeldOrganization } from '$lib/platform/host';
	import StandaloneSurface from '@rentable/design/block/standalone-surface.svelte';
	import { Button } from '@rentable/design/primitive/button/index.js';
	import { Callout } from '@rentable/design/primitive/callout/index.js';
	import * as Field from '@rentable/design/primitive/field/index.js';
	import * as InputGroup from '@rentable/design/primitive/input-group/index.js';
	import DisconnectDialog from '$lib/organization/component/disconnect-dialog.svelte';
	import { LL } from '$lib/i18n/i18n-svelte';
	import BuildingIcon from '@lucide/svelte/icons/building';
	import KeyRoundIcon from '@lucide/svelte/icons/key-round';
	import LinkIcon from '@lucide/svelte/icons/link';
	import LockOpenIcon from '@lucide/svelte/icons/lock-open';
	import UserIcon from '@lucide/svelte/icons/user';

	/**
	 * The wall, and the ways through it.
	 *
	 * Nothing renders behind it: not a workspace, not a name, not a count. That is the criterion
	 * rather than a styling choice: a machine nobody has unlocked has no workspace to draw from.
	 *
	 * **It reads as a login page, and the shape is the human's, settled on screen on 2026-08-20**:
	 * one word of title, a line under it, air, and the way in. Nothing else. A desktop window names
	 * its application three times before this card gets a turn, so the mark stays off it. It stays
	 * on the shared application surface, which [[rules/interface]] under *Application surfaces*
	 * requires.
	 *
	 * **Two situations, and neither is a service's.** A machine that holds no organization has
	 * nothing to unlock, and is offered the first run. A machine that holds one is its login page:
	 * it names the organization and asks for a username and a password, which open a vault on this
	 * machine with or without a network; there is no window to run out and no session to
	 * re-establish. *Three situations stood here until organizations: no account, a window closed
	 * after three days, and an identity with no session. Every one was about a control plane, and
	 * the control plane is what the organization replaces.*
	 *
	 * **The organization is named, never chosen.** A machine holds one organization or none
	 * (effort 824, requirement 7), so there is nothing here to choose between, and the name is a
	 * line of text rather than a control. The role is not on it: a role is a fact of the account,
	 * found by the sign-in, and a machine that connected by link and has not signed in yet holds
	 * none. *Several organizations were a select, and before that rows carrying name and role; the
	 * human withdrew the rows on 2026-09-13 because they made the wall a choice between
	 * organizations rather than a login page, and the same day gave the picture under which a
	 * machine holds one.*
	 *
	 * **Two fields, username above password** (requirement 19). The username is which member of
	 * the organization this is, and the password is what opens their vault; the shell tries the
	 * password against each vault and checks the username on the row that opens, so a pair that
	 * opens nothing is refused with one sentence and nothing here says whether the username exists.
	 * Each field leads with its subject's glyph inside the input group, muted so it does not
	 * outweigh the label (requirement 15), and the unlock carries its verb's (requirement 14).
	 *
	 * **A machine with nothing is offered two ways in.** One word of title, a line that says what
	 * the two are for, and two controls carrying their verb's glyph and a short label: create an
	 * organization, which is the first run on the person's own Turso account, and connect with a
	 * link, which is the connect screen. *Settled with the human on 2026-09-13 over three looks
	 * at the first screen of the build that forgets the old shape: one word in the title, a
	 * friendly line under it, three words at most on a control.*
	 *
	 * **One link at the foot while locked.** Disconnect forgets the organization on this machine
	 * (requirement 20), after the one confirm the dialog asks, and the wall comes back as a machine
	 * that holds nothing, offering the two ways in again. Connecting and setting up are offered
	 * only there, since a machine holds one organization (requirement 17) and reaching another is
	 * disconnect, then connect. *This said three links: connect by link and set up stood beside
	 * disconnect until 2026-09-13.*
	 */
	let {
		situation,
		organization,
		isSigningIn,
		errorMessage,
		onSignIn,
		onDisconnect,
		onSetUpOrganization,
		onJoinByLink
	}: {
		/** which of the two situations this is, from `organizationAdmission`. */
		situation: 'noOrganization' | 'locked';
		/** what this machine holds, which is what it can unlock; `null` where it holds nothing. */
		organization: HeldOrganization | null;
		/** a password is being tried, which is a key derivation the person is waiting on. */
		isSigningIn: boolean;
		errorMessage: string | null;
		onSignIn: (username: string, password: string) => void;
		/** forget the held organization on this machine, once the person has confirmed it. */
		onDisconnect: () => Promise<void> | void;
		/** the first run: an organization on the person's own Turso account. */
		onSetUpOrganization: () => void;
		/** the connect screen: the organization's link, pasted or handed over by the operating system. */
		onJoinByLink: () => void;
	} = $props();

	let username = $state('');
	let password = $state('');
	let isDisconnectOpen = $state(false);

	const title = $derived(
		situation === 'noOrganization'
			? $LL.layout.signIn.noOrganizationTitle()
			: $LL.layout.signIn.title()
	);

	const description = $derived(
		situation === 'noOrganization'
			? $LL.layout.signIn.noOrganizationDescription()
			: $LL.layout.signIn.organizationDescription()
	);

	const canUnlock = $derived(
		organization !== null && username.trim().length > 0 && password.length > 0 && !isSigningIn
	);

	const unlock = () => {
		if (!canUnlock) return;

		onSignIn(username, password);
	};
</script>

<StandaloneSurface tone="neutral" {title} {description} busy={isSigningIn}>
	<!-- the extra step above what the surface gives every screen: with the card down to a title,
	     a line and a way in, the gap between saying what this is and offering the way through it
	     is the only grouping left to draw. -->
	<div class="space-y-4 pt-2" data-sign-in-situation={situation}>
		{#if errorMessage}
			<Callout tone="error">{errorMessage}</Callout>
		{/if}

		{#if situation === 'noOrganization'}
			<Button class="w-full justify-center" onclick={onSetUpOrganization}>
				<BuildingIcon class="size-4" />
				{$LL.layout.signIn.setUp()}
			</Button>
			<Button variant="outline" class="w-full justify-center" onclick={onJoinByLink}>
				<LinkIcon class="size-4" />
				{$LL.layout.signIn.connectByLink()}
			</Button>
		{:else}
			<form
				class="space-y-4"
				onsubmit={(event) => {
					event.preventDefault();
					unlock();
				}}
			>
				{#if organization}
					<Field.Field>
						<Field.Label for="sign-in-organization">{$LL.layout.signIn.organization()}</Field.Label>
						<!-- named rather than chosen: the one organization this machine holds, as a line. -->
						<p
							id="sign-in-organization"
							class="text-sm font-medium"
							data-sign-in-organization={organization.id}
						>
							{organization.name}
						</p>
					</Field.Field>
				{/if}

				<!-- each field's subject, as a leading glyph. The addon draws it in the muted
				     foreground so it does not outweigh the label beside it (*Balance weight and
				     contrast*, Refactoring UI p.56). It is the subject and never the error: a
				     validation error marks the label line, as the interface rule says. -->
				<Field.Field>
					<Field.Label for="sign-in-username">{$LL.layout.signIn.username()}</Field.Label>
					<InputGroup.Root data-disabled={isSigningIn ? 'true' : undefined}>
						<InputGroup.Addon>
							<UserIcon />
						</InputGroup.Addon>
						<InputGroup.Input
							id="sign-in-username"
							name="username"
							autocomplete="username"
							bind:value={username}
							disabled={isSigningIn}
						/>
					</InputGroup.Root>
				</Field.Field>

				<Field.Field>
					<Field.Label for="sign-in-password">{$LL.layout.signIn.password()}</Field.Label>
					<InputGroup.Root data-disabled={isSigningIn ? 'true' : undefined}>
						<InputGroup.Addon>
							<KeyRoundIcon />
						</InputGroup.Addon>
						<InputGroup.Input
							id="sign-in-password"
							name="password"
							type="password"
							autocomplete="current-password"
							bind:value={password}
							disabled={isSigningIn}
						/>
					</InputGroup.Root>
				</Field.Field>

				<Button type="submit" class="w-full justify-center" disabled={!canUnlock}>
					<LockOpenIcon class="size-4" />
					{isSigningIn ? $LL.common.actions.working() : $LL.layout.signIn.unlock()}
				</Button>
			</form>

			{#if isSigningIn}
				<!-- Argon2id is running where a person is waiting: a quarter of a second on a fast
				     machine, longer on a slow one, and the screen says so rather than sitting still.
				     Ticket 06 measured it, and the measurement is why this is a sentence and not a
				     bar: too short to fill one, too long to show nothing. -->
				<p class="text-center text-sm text-muted-foreground">{$LL.layout.signIn.unlocking()}</p>
			{/if}

			<Button
				variant="link"
				class="w-full justify-center"
				onclick={() => (isDisconnectOpen = true)}
				disabled={isSigningIn}
			>
				{$LL.layout.signIn.disconnect()}
			</Button>

			<DisconnectDialog
				open={isDisconnectOpen}
				onOpenChange={(open) => (isDisconnectOpen = open)}
				organizationName={organization?.name ?? ''}
				{onDisconnect}
			/>
		{/if}
	</div>
</StandaloneSurface>
