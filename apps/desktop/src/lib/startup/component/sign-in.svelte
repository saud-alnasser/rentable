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
	import { OrganizationSwitcher } from '$lib/organization/ui';
	import { WayInPreferences } from '$lib/settings/ui';
	import { LL } from '$lib/i18n/i18n-svelte';
	import { tick } from 'svelte';
	import WaysIn from './ways-in.svelte';

	/**
	 * The welcome, and the wall: the first step of the way in, on the way-in surface.
	 *
	 * Nothing renders behind it: not a workspace, not a count. That is the criterion rather than a
	 * styling choice: a machine nobody has unlocked has no workspace to draw from.
	 *
	 * **The look is the human's, chosen on screen on 2026-09-30 and 2026-10-01** (effort 843,
	 * ticket 01). The mark heads the column, the title and one line follow it, then the step's own
	 * controls, then one prominent button. *It was a card on the standalone surface with the mark
	 * kept off it, settled on 2026-08-20, and the human set that aside for the way-in surface.*
	 *
	 * **With no organization it is the welcome** (requirements 2 and 3; effort 851, requirement 1):
	 * "rentable" as it is written, what it is for in one line, and the two ways in (`./ways-in`).
	 * There is no switcher, since there is nothing to switch between. Nothing here names a group, a
	 * database or a consent: those are the walk's own machinery and mean nothing to a person
	 * deciding which way in they hold.
	 *
	 * **Locked, it is the wall, and it asks for one thing** (requirement 6). "Sign in" is the title,
	 * and the organization switcher heads the column under it (effort 851, requirement 2): the
	 * chosen organization's tile and name, which is the one fact a person signing in does not
	 * already know, drawn once and nowhere else on the wall. Under it the username above the
	 * password with no glyphs (requirement 8), and one prominent "sign in". *The organization's name
	 * was the title until effort 851, when a machine came to hold several and the name moved onto
	 * the control that chooses between them; a machine held one or none from effort 824 until then.*
	 *
	 * **The switcher is how a person moves between organizations, adds one, and removes one**
	 * (effort 851, requirements 3 to 6). Choosing another puts that organization's wall up, which
	 * is the record's choice and not this component's, so the fields start empty for it. "Add
	 * organization" turns the wall into the add step: the welcome's two ways in under "add an
	 * organization", with back to the wall it came from. The walk either way starts from there, and
	 * leaving it brings the selected organization's wall back. A row's x asks once and removes that
	 * organization alone. None of it can be used while a sign-in runs.
	 *
	 * **"Can't sign in?" answers with a sentence**, at the human's word on 2026-10-01: ask a manager
	 * or the owner for help. Nobody on this machine can reset a password, so the only true answer is
	 * who can. The foot control carries the language and the appearance and nothing else (effort
	 * 851, requirement 15): its "use a link" and "disconnect this machine" were the wall's way out of
	 * a jam, and the switcher's "add organization" and its x are that way out now, in sight.
	 *
	 * **A machine somebody signed out from another machine reads one line more** (effort 826,
	 * requirement 22): a note above the fields saying what happened, since the person did not sign
	 * themselves out and is owed the reason. It is drawn as a note rather than as an error.
	 */
	let {
		situation,
		organizations,
		selected,
		isSigningIn,
		errorMessage,
		errorDetail = null,
		earlier = null,
		refusals = {},
		onSignIn,
		onSelect,
		onRemove,
		onSetUpOrganization,
		onJoinByLink
	}: {
		/**
		 * which situation this is, from `organizationAdmission`. `signedOutElsewhere` is `locked`
		 * with the sentence for a session somebody ended from another machine.
		 */
		situation: 'noOrganization' | 'locked' | 'signedOutElsewhere';
		/** every organization this machine holds, which the switcher lists; empty where none is held. */
		organizations: HeldOrganization[];
		/** the id of the organization the wall stands on, as the record selects it. */
		selected: string | null;
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
		/**
		 * why each organization this run could not open was refused, by its id, which the switcher
		 * says above the chosen one (effort 857, requirement 7).
		 */
		refusals?: Readonly<Record<string, { sentence: string; byVersion: boolean }>>;
		onSignIn: (username: string, password: string) => void;
		/** another held organization was chosen at the switcher: put its wall up. */
		onSelect: (organizationId: string) => void;
		/**
		 * forget one held organization, once the person has confirmed it; a refusal it throws
		 * stays in the confirm.
		 */
		onRemove: (organizationId: string) => Promise<void> | void;
		/** the walk, on the person's own Turso account: the way in for whoever owns the organization. */
		onSetUpOrganization: () => void;
		/**
		 * the connect screen: a link and its code, pasted or handed over by the operating system.
		 * Offered on the welcome, and on the wall through the switcher's "add organization".
		 */
		onJoinByLink: () => void;
	} = $props();

	let username = $state('');
	let password = $state('');
	/** whether the switcher's "add organization" turned the wall into the add step. */
	let isAdding = $state(false);
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
	 * a machine offered the first run has nothing to name, and one behind the wall names the
	 * organization the record selects. The fallback is the type's rather than a state: `locked` is
	 * only reached with an organization recorded on this machine.
	 */
	const held = $derived(
		situation === 'noOrganization'
			? null
			: (organizations.find((organization) => organization.id === selected) ?? null)
	);

	/** which step this is: the welcome, the wall, or the wall's add step. */
	const step = $derived(!held ? 'welcome' : isAdding ? 'add' : 'wall');

	const title = $derived(
		step === 'welcome'
			? $LL.layout.signIn.noOrganizationTitle()
			: step === 'add'
				? $LL.organization.switcher.addTitle()
				: $LL.common.actions.signIn()
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
	{step}
	{title}
	named={step === 'welcome'}
	description={step === 'welcome' ? $LL.layout.signIn.noOrganizationSubtitle() : undefined}
	back={step === 'add'
		? { label: $LL.organization.switcher.back(), onclick: () => (isAdding = false) }
		: undefined}
	busy={isSigningIn}
>
	<div
		class="flex flex-col gap-4"
		data-sign-in-situation={situation}
		data-sign-in-organization={held?.id}
	>
		{#if held && step === 'wall'}
			<!-- the organization this wall is for, and the way to another: above everything else on
			     the wall, the note and the fields included, since it says what they are for. -->
			<OrganizationSwitcher
				{organizations}
				{selected}
				{refusals}
				disabled={isSigningIn}
				{onSelect}
				onAdd={() => (isAdding = true)}
				{onRemove}
			/>
		{/if}

		{#if errorMessage && step !== 'add'}
			<Callout tone="error">{errorMessage}</Callout>
			<!-- the shell's own words, closed: the sentence above is the reader's ([[rules/interface]],
			     *Error*). -->
			{#if errorDetail}
				<DetailDisclosure detail={errorDetail} name="sign-in" />
			{/if}
		{/if}

		{#if !held}
			<!-- the two ways in: a person standing here holds one of the two, and the line under each
			     is what tells them which. -->
			<WaysIn {onSetUpOrganization} {onJoinByLink} />

			{@render earlierLine()}
		{:else if step === 'add'}
			<!-- the same two ways, for another organization beside the ones held. Back is the wall it
			     came from; the selection is the record's, so nothing here has to restore it. -->
			<WaysIn {onSetUpOrganization} {onJoinByLink} />
		{:else}
			{#if situation === 'signedOutElsewhere'}
				<!-- a note and not an error: nothing failed, and what the person needs is the reason
				     their session is gone. The way through it is the fields below, unchanged. -->
				<Callout tone="info" data-sign-in-signed-out-elsewhere>
					{$LL.layout.signIn.signedOutElsewhere()}
				</Callout>
			{/if}

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
		{/if}
	</div>

	{#snippet foot()}
		<WayInPreferences />
	{/snippet}
</WayInSurface>
