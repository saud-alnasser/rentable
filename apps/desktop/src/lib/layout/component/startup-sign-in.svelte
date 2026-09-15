<script lang="ts">
	import type { HeldOrganization } from '$lib/platform/host';
	import StandaloneSurface from '@rentable/design/block/standalone-surface.svelte';
	import { Button } from '@rentable/design/primitive/button/index.js';
	import { Callout } from '@rentable/design/primitive/callout/index.js';
	import * as Collapsible from '@rentable/design/primitive/collapsible/index.js';
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
	 * **The organization's name is the card's heading** (effort 826, requirement 11 as corrected on
	 * 2026-09-15). A person standing here already knows they are signing in; what they do not know
	 * from a title saying *welcome back* is which organization this machine holds, and that is the
	 * one fact the card has to offer before the fields. So the name is the heading, *sign in to
	 * continue* is the line under it, and the labelled organization line the form used to carry is
	 * gone: it said the same thing twice, once behind a label answering a question nobody asked.
	 * *This was a title string and a labelled field until the human's first run of the build, where
	 * the card read as four things of equal weight with no one thing to look at first.*
	 *
	 * **The two ways out of a jam sit behind one disclosure at the foot** (requirement 11, same
	 * correction). Opening a link and disconnecting this machine are each the exception to the
	 * fields rather than an alternative to them, and standing them in the card as two more text
	 * controls made the foot as busy as the form. One quiet control, *trouble signing in?*, is the
	 * question a person who cannot get in is already asking, and both answers are behind it. It is
	 * the packaged collapsible, so the control carries `aria-expanded` and the rows are reached by
	 * keyboard in the order they are read; neither row is drawn until it opens. *The link showed on
	 * every locked machine until the human's first run, where a machine already connected was being
	 * offered the way to connect at the same weight as the way in.*
	 *
	 * **A machine somebody signed out from another machine reads one line more** (effort 826,
	 * requirement 22). It is the locked card with a callout above the fields saying what happened,
	 * because the way back in is the same password and the person is owed the reason: they did not
	 * sign themselves out, and without the sentence the screen looks like the application losing
	 * their session. It is drawn as a note rather than as an error, since nothing failed.
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
	 * (effort 824, requirement 7), so there is nothing here to choose between, and the name is the
	 * heading rather than a control. The role is not on it: a role is a fact of the account, found
	 * by the sign-in, and a machine that connected by link and has not signed in yet holds none.
	 * *Several organizations were a select, and before that rows carrying name and role; the human
	 * withdrew the rows on 2026-09-13 because they made the wall a choice between organizations
	 * rather than a login page, and the same day gave the picture under which a machine holds one.*
	 *
	 * **Two fields, username above password** (requirement 19). The username is which member of
	 * the organization this is, and the password is what opens their vault; the shell tries the
	 * password against each vault and checks the username on the row that opens, so a pair that
	 * opens nothing is refused with one sentence and nothing here says whether the username exists.
	 * Each field leads with its subject's glyph inside the input group, muted so it does not
	 * outweigh the label (requirement 15), and the unlock carries its verb's (requirement 14).
	 *
	 * **A machine with nothing is offered two ways in, and each says what it needs** (effort 828,
	 * requirement 13). One word of title, a line saying this machine holds nothing yet, and two
	 * controls carrying their verb's glyph and a short label, each with one sentence under it: the
	 * Turso account, which is the walk, for whoever owns the organization whether it is being made
	 * now or is already on the account; and the link with its code, which is the connect screen,
	 * for what an administrator or a member handed over. *Settled with the human on 2026-09-13 over
	 * three looks at the first screen of the build that forgets the old shape: one word in the
	 * title, a friendly line under it, three words at most on a control. The two sentences were
	 * added on 2026-09-15, when the human walked the merged build and could not tell from the
	 * labels which of the two was theirs.*
	 *
	 * **Nothing here names a group, a database or a consent.** They are the walk's own machinery
	 * and mean nothing to a person deciding which of two ways in they hold; the account they have
	 * and the link they were handed are what they can answer with.
	 *
	 * **Disconnect forgets the organization on this machine** (effort 824, requirement 20), after
	 * the one confirm the dialog asks, and the wall comes back as a machine that holds nothing,
	 * offering the two ways in again. Setting up is offered only there, since a machine holds one
	 * organization (requirement 17) and reaching another is disconnect, then connect. Beside it,
	 * the way to the connect screen for a person holding a link (effort 826, requirement 11): a
	 * reset link is opened by somebody whose machine already holds the organization, so the screen
	 * it is opened on has to be reachable from here.
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
		onSignIn: (username: string, password: string) => void;
		/** forget the held organization on this machine, once the person has confirmed it. */
		onDisconnect: () => Promise<void> | void;
		/** the walk, on the person's own Turso account: the way in for whoever owns the organization. */
		onSetUpOrganization: () => void;
		/**
		 * the connect screen: an organization link or an invitation link, pasted or handed over by
		 * the operating system. Offered in both situations, since a reset link is opened from here.
		 */
		onJoinByLink: () => void;
	} = $props();

	let username = $state('');
	let password = $state('');
	let isDisconnectOpen = $state(false);
	/**
	 * whether the two ways out of a jam are showing.
	 *
	 * The only state this card holds that is not something a person typed, and it starts closed on
	 * every render: the card is drawn afresh each time the wall goes up, so there is no earlier
	 * visit for it to remember and nothing about a person who could not sign in last time that
	 * should decide what the card looks like for the next one.
	 */
	let isHelpOpen = $state(false);

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
</script>

<StandaloneSurface tone="neutral" title={heading} description={subtitle} busy={isSigningIn}>
	<!-- the extra step above what the surface gives every screen: with the card down to a heading,
	     a line and a way in, the gap between saying what this is and offering the way through it
	     is the only grouping left to draw. -->
	<div
		class="space-y-4 pt-2"
		data-sign-in-situation={situation}
		data-sign-in-organization={held?.id}
	>
		{#if errorMessage}
			<Callout tone="error">{errorMessage}</Callout>
		{/if}

		{#if situation === 'signedOutElsewhere'}
			<!-- a note and not an error: nothing failed, and what the person needs is the reason
			     their session is gone. The way through it is the fields below, unchanged. -->
			<Callout tone="info" data-sign-in-signed-out-elsewhere>
				{$LL.layout.signIn.signedOutElsewhere()}
			</Callout>
		{/if}

		{#if !held}
			<!-- each way in says what it needs, under the control that takes it: a person standing
			     here holds one of the two and nothing else on the screen tells them which is theirs
			     (effort 828, requirement 13). The sentence is muted and a step below its control in
			     weight, so the two controls stay the thing being chosen between. -->
			<div class="space-y-2">
				<Button class="w-full justify-center" onclick={onSetUpOrganization}>
					<BuildingIcon class="size-4" />
					{$LL.layout.signIn.setUp()}
				</Button>
				<p class="text-sm text-muted-foreground" data-sign-in-set-up-description>
					{$LL.layout.signIn.setUpDescription()}
				</p>
			</div>

			<div class="space-y-2">
				<Button variant="outline" class="w-full justify-center" onclick={onJoinByLink}>
					<LinkIcon class="size-4" />
					{$LL.layout.signIn.connectByLink()}
				</Button>
				<p class="text-sm text-muted-foreground" data-sign-in-link-description>
					{$LL.layout.signIn.connectByLinkDescription()}
				</p>
			</div>
		{:else}
			<form
				class="space-y-4"
				onsubmit={(event) => {
					event.preventDefault();
					unlock();
				}}
			>
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
					{isSigningIn ? $LL.common.actions.working() : $LL.common.actions.signIn()}
				</Button>
			</form>

			{#if isSigningIn}
				<!-- Argon2id is running where a person is waiting: a quarter of a second on a fast
				     machine, longer on a slow one, and the screen says so rather than sitting still.
				     Ticket 06 measured it, and the measurement is why this is a sentence and not a
				     bar: too short to fill one, too long to show nothing. -->
				<p class="text-center text-sm text-muted-foreground">{$LL.layout.signIn.unlocking()}</p>
			{/if}

			<!-- the foot, and the whole of what is not the way in. Muted and a step below the form
			     in weight, so the reader who can sign in never has to decide whether it concerns
			     them (*De-emphasize secondary actions*, Refactoring UI); the extra air above it is
			     what separates the exception from the rule. -->
			<div class="pt-2">
				<Collapsible.Root bind:open={isHelpOpen}>
					<Collapsible.Trigger disabled={isSigningIn}>
						{#snippet child({ props })}
							<Button
								{...props}
								variant="link"
								size="sm"
								class="w-full justify-center text-muted-foreground"
								data-sign-in-help
							>
								{$LL.layout.signIn.help()}
							</Button>
						{/snippet}
					</Collapsible.Trigger>

					<Collapsible.Content>
						{#if isHelpOpen}
							<!-- drawn only while it is open, so a card nobody asked for help on puts
							     neither row in front of a reader or a screen reader. Reading order is
							     the order a person tries them in: open the link somebody sent you
							     first, and take this machine out of the organization only if that is
							     not what you were given. -->
							<div class="flex flex-col gap-1 pt-2">
								<Button
									variant="link"
									size="sm"
									class="w-full justify-center"
									onclick={onJoinByLink}
									disabled={isSigningIn}
								>
									{$LL.layout.signIn.useALink()}
								</Button>

								<Button
									variant="link"
									size="sm"
									class="w-full justify-center"
									onclick={() => (isDisconnectOpen = true)}
									disabled={isSigningIn}
								>
									{$LL.layout.signIn.disconnect()}
								</Button>
							</div>
						{/if}
					</Collapsible.Content>
				</Collapsible.Root>
			</div>

			<!-- outside the disclosure: the question is asked over the card, and closing the
			     disclosure behind it would take the dialog down with it. It draws nothing until
			     somebody opens it. -->
			<DisconnectDialog
				open={isDisconnectOpen}
				onOpenChange={(open) => (isDisconnectOpen = open)}
				organizationName={held.name}
				{onDisconnect}
			/>
		{/if}
	</div>
</StandaloneSurface>
