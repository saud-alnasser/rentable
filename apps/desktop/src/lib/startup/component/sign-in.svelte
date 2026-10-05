<script lang="ts">
	import type { EarlierRecords } from '$lib/workspace';
	import type { HeldOrganization } from '$lib/organization';
	import PasswordInput from '@rentable/design/block/password-input.svelte';
	import WayInSurface from '@rentable/design/block/way-in-surface.svelte';
	import { Button } from '@rentable/design/primitive/button/index.js';
	import { Callout } from '@rentable/design/primitive/callout/index.js';
	import * as Field from '@rentable/design/primitive/field/index.js';
	import { Input } from '@rentable/design/primitive/input/index.js';
	import DetailDisclosure from '$lib/error/component/detail-disclosure.svelte';
	import { DisconnectDialog } from '$lib/organization/ui';
	import { WayInPreferences } from '$lib/settings/ui';
	import { LL } from '$lib/i18n/i18n-svelte';
	import { tick } from 'svelte';

	/**
	 * The welcome, and the wall: the first step of the way in, on the way-in surface.
	 *
	 * Nothing renders behind it: not a workspace, not a name, not a count. That is the criterion
	 * rather than a styling choice: a machine nobody has unlocked has no workspace to draw from.
	 *
	 * **The look is the human's, chosen on screen on 2026-09-30 and 2026-10-01** (effort 843,
	 * ticket 01). The mark heads the column, the title and one line follow it, then the step's own
	 * controls, then one prominent button. *It was a card on the standalone surface with the mark
	 * kept off it, settled on 2026-08-20, and the human set that aside for the way-in surface.*
	 *
	 * **With no organization it is the welcome** (requirements 2 and 3): "rentable" as it is
	 * written, what it is for in one line, and the two ways in as a stacked pair of one size, each a
	 * label over the one line saying whose it is. Setting up is the prominent one, since it is the
	 * first thing anybody does with the application, and joining is outlined. *The two sentences go
	 * back to 2026-09-15, when the human walked the merged build and could not tell from the labels
	 * which way in was theirs.* Nothing here names a group, a database or a consent: those are the
	 * walk's own machinery and mean nothing to a person deciding which way in they hold.
	 *
	 * **Locked, it is the wall, and it asks for one thing** (requirement 6). The organization's
	 * name is the title, drawn as it is written, because which organization this machine holds is
	 * the one fact a person signing in does not already know (effort 826, requirement 11 as
	 * corrected on 2026-09-15). Under it, "sign in to continue.", the username above the password
	 * with no glyphs (requirement 8), and one prominent "sign in". The organization is named, never
	 * chosen: a machine holds one organization or none (effort 824, requirement 7).
	 *
	 * **"Can't sign in?" answers with a sentence**, at the human's word on 2026-10-01: ask a manager
	 * or the owner for help. Nobody on this machine can reset a password, so the only true answer is
	 * who can. The two ways out of a jam it used to open, opening a link and disconnecting this
	 * machine, are in the foot control's popover on the wall alone, where a person who has neither
	 * a username nor a password still reaches disconnect (effort 824, requirement 20).
	 *
	 * **A machine somebody signed out from another machine reads one line more** (effort 826,
	 * requirement 22): a note above the fields saying what happened, since the person did not sign
	 * themselves out and is owed the reason. It is drawn as a note rather than as an error.
	 *
	 * **Disconnect forgets the organization on this machine** (effort 824, requirement 20), after
	 * the one confirm the dialog asks, and the welcome comes back.
	 */
	let {
		situation,
		organization,
		isSigningIn,
		errorMessage,
		errorDetail = null,
		earlier = null,
		onSignIn,
		onDisconnect,
		onSetUpOrganization,
		onJoinByLink
	}: {
		/**
		 * which situation this is, from `organizationAdmission`. `signedOutElsewhere` is `locked`
		 * with the sentence for a session somebody ended from another machine.
		 */
		situation: 'noOrganization' | 'locked' | 'signedOutElsewhere';
		/** what this machine holds, which is what it can unlock; `null` where it holds nothing. */
		organization: HeldOrganization | null;
		/** a password is being tried, which is a key derivation the person is waiting on. */
		isSigningIn: boolean;
		errorMessage: string | null;
		/** what the shell said behind `errorMessage`, kept behind a closed disclosure. */
		errorDetail?: string | null;
		/**
		 * the records an earlier version left on this machine and still on offer, said in one
		 * quiet line; `null` where there are none (effort 838, requirement 18).
		 */
		earlier?: EarlierRecords | null;
		onSignIn: (username: string, password: string) => void;
		/** forget the held organization on this machine, once the person has confirmed it. */
		onDisconnect: () => Promise<void> | void;
		/** the walk, on the person's own Turso account: the way in for whoever owns the organization. */
		onSetUpOrganization: () => void;
		/**
		 * the connect screen: a link and its code, pasted or handed over by the operating system.
		 * Offered in both situations, since a link for an account with a password is opened from here.
		 */
		onJoinByLink: () => void;
	} = $props();

	let username = $state('');
	let password = $state('');
	let isDisconnectOpen = $state(false);
	/**
	 * whether "can't sign in?" has been answered. It starts unanswered every time the wall goes up:
	 * nothing about a person who could not sign in last time decides what the wall says next.
	 */
	let isHelpAnswered = $state(false);
	let usernameField = $state<HTMLInputElement | null>(null);
	let passwordField = $state<HTMLInputElement | null>(null);
	/** a sign-in has been tried and has not yet answered; plain, since nothing draws from it. */
	let isAnswerAwaited = false;

	/**
	 * a machine offered the first run has nothing to name, and one behind the wall names what it
	 * holds. The fallback is the type's rather than a state: `locked` is only reached with an
	 * organization recorded on this machine.
	 */
	const held = $derived(situation === 'noOrganization' ? null : organization);

	const heading = $derived(held ? held.name : $LL.layout.signIn.noOrganizationTitle());

	const subtitle = $derived(
		held ? $LL.layout.signIn.subtitle() : $LL.layout.signIn.noOrganizationSubtitle()
	);

	const canUnlock = $derived(
		held !== null && username.trim().length > 0 && password.length > 0 && !isSigningIn
	);

	const unlock = () => {
		if (!canUnlock) return;

		onSignIn(username, password);
	};

	// arriving at the wall puts the cursor in its first field (requirement 8), and only on arriving:
	// the field is drawn once per wall.
	$effect(() => {
		if (!usernameField) return;

		void tick().then(() => usernameField?.focus());
	});

	// a sign-in that fails puts the cursor back in the password, with what was typed selected, so
	// the next keystroke replaces it as a Mac's own sign-in does (at the human's word on 2026-10-01).
	// Both fields are disabled while it runs, which drops the focus, and the password is what a
	// person who mistyped tries again.
	$effect(() => {
		if (isSigningIn) {
			isAnswerAwaited = true;
			return;
		}

		if (!isAnswerAwaited || errorMessage === null) return;

		isAnswerAwaited = false;
		void tick().then(() => {
			passwordField?.focus();
			passwordField?.select();
		});
	});

	// the wall's two ways out of a jam, in the foot control's popover; the welcome hands in none.
	// Neither can be taken while a sign-in runs: a link would leave the step under a sign-in that
	// carries on, and the startup unit ignores a disconnect until it answers.
	const extras = $derived(
		held
			? [
					{ label: $LL.layout.signIn.useALink(), onSelect: onJoinByLink, disabled: isSigningIn },
					{
						label: $LL.layout.signIn.disconnect(),
						onSelect: () => (isDisconnectOpen = true),
						destructive: true,
						disabled: isSigningIn
					}
				]
			: []
	);
</script>

<!-- one quiet line, and nothing to press: the records are brought in from the settings area once
     there is a workspace to bring them into, and until then all a person needs is to know they
     are not lost (effort 838, requirement 18). Muted, and after the way in, so it never competes
     with it. -->
{#snippet earlierLine()}
	{#if earlier}
		<p class="text-center text-sm text-muted-foreground" data-sign-in-earlier={earlier.version}>
			{$LL.earlier.wayIn({ version: earlier.version })}
		</p>
	{/if}
{/snippet}

<WayInSurface
	step={held ? 'wall' : 'welcome'}
	title={heading}
	named
	description={subtitle}
	busy={isSigningIn}
>
	<div
		class="flex flex-col gap-4"
		data-sign-in-situation={situation}
		data-sign-in-organization={held?.id}
	>
		{#if errorMessage}
			<Callout tone="error">{errorMessage}</Callout>
			<!-- the shell's own words, closed: the sentence above is the reader's ([[rules/interface]],
			     *Error*). -->
			{#if errorDetail}
				<DetailDisclosure detail={errorDetail} name="sign-in" />
			{/if}
		{/if}

		{#if situation === 'signedOutElsewhere'}
			<!-- a note and not an error: nothing failed, and what the person needs is the reason
			     their session is gone. The way through it is the fields below, unchanged. -->
			<Callout tone="info" data-sign-in-signed-out-elsewhere>
				{$LL.layout.signIn.signedOutElsewhere()}
			</Callout>
		{/if}

		{#if !held}
			<!-- the two ways in, one size, each a label over whose it is: a person standing here holds
			     one of the two, and the line under each is what tells them which. -->
			<div class="flex flex-col gap-3">
				<Button
					size="lg"
					class="h-auto w-full flex-col gap-1 py-3"
					onclick={onSetUpOrganization}
					data-sign-in-set-up
				>
					<span class="first-letter:uppercase">{$LL.layout.signIn.setUp()}</span>
					<span class="text-xs font-normal opacity-80" data-sign-in-set-up-description>
						{$LL.layout.signIn.setUpDescription()}
					</span>
				</Button>

				<Button
					size="lg"
					variant="outline"
					class="h-auto w-full flex-col gap-1 py-3"
					onclick={onJoinByLink}
					data-sign-in-join
				>
					<span class="first-letter:uppercase">{$LL.layout.signIn.connectByLink()}</span>
					<span class="text-xs font-normal text-muted-foreground" data-sign-in-link-description>
						{$LL.layout.signIn.connectByLinkDescription()}
					</span>
				</Button>
			</div>

			{@render earlierLine()}
		{:else}
			<form
				class="flex flex-col gap-4 text-start"
				onsubmit={(event) => {
					event.preventDefault();
					unlock();
				}}
			>
				<Field.Field>
					<Field.Label for="sign-in-username">{$LL.layout.signIn.username()}</Field.Label>
					<Input
						id="sign-in-username"
						name="username"
						autocomplete="username"
						class="h-9"
						bind:ref={usernameField}
						bind:value={username}
						disabled={isSigningIn}
					/>
				</Field.Field>

				<Field.Field>
					<Field.Label for="sign-in-password">{$LL.layout.signIn.password()}</Field.Label>
					<PasswordInput
						id="sign-in-password"
						name="password"
						autocomplete="current-password"
						class="h-9"
						bind:ref={passwordField}
						bind:value={password}
						disabled={isSigningIn}
					/>
				</Field.Field>

				<Button type="submit" size="lg" class="w-full" disabled={!canUnlock}>
					<span class="first-letter:uppercase">
						{isSigningIn ? $LL.common.actions.working() : $LL.common.actions.signIn()}
					</span>
				</Button>
			</form>

			{#if isSigningIn}
				<!-- Argon2id is running where a person is waiting: a quarter of a second on a fast
				     machine, longer on a slow one, and the screen says so rather than sitting still.
				     Effort 826's ticket 06 measured it, and the measurement is why this is a sentence
				     and not a bar. -->
				<p class="text-center text-sm text-muted-foreground">{$LL.layout.signIn.unlocking()}</p>
			{/if}

			{@render earlierLine()}

			<!-- the question a person who cannot get in is already asking, and its answer in its
			     place, said as a status so a screen reader hears it arrive. -->
			{#if isHelpAnswered}
				<p
					class="text-center text-sm text-balance text-muted-foreground"
					role="status"
					data-sign-in-help-answer
				>
					{$LL.layout.signIn.helpAnswer()}
				</p>
			{:else}
				<Button
					variant="link"
					size="sm"
					class="self-center text-muted-foreground"
					onclick={() => (isHelpAnswered = true)}
					disabled={isSigningIn}
					data-sign-in-help
				>
					<span class="first-letter:uppercase">{$LL.layout.signIn.help()}</span>
				</Button>
			{/if}

			<!-- draws nothing until somebody opens it from the foot control. -->
			<DisconnectDialog
				open={isDisconnectOpen}
				onOpenChange={(open) => (isDisconnectOpen = open)}
				organizationName={held.name}
				{onDisconnect}
			/>
		{/if}
	</div>

	{#snippet foot()}
		<WayInPreferences {extras} />
	{/snippet}
</WayInSurface>
