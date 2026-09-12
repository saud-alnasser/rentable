<script lang="ts">
	import type { JoinedOrganization } from '$lib/platform/host';
	import StandaloneSurface from '@rentable/design/block/standalone-surface.svelte';
	import { Button } from '@rentable/design/primitive/button/index.js';
	import { Callout } from '@rentable/design/primitive/callout/index.js';
	import * as Field from '@rentable/design/primitive/field/index.js';
	import * as InputGroup from '@rentable/design/primitive/input-group/index.js';
	import * as RadioGroup from '@rentable/design/primitive/radio-group/index.js';
	import { LL } from '$lib/i18n/i18n-svelte';
	import KeyRoundIcon from '@lucide/svelte/icons/key-round';
	import LockOpenIcon from '@lucide/svelte/icons/lock-open';

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
	 * **Two situations, and neither is a service's.** A machine that has joined no organization
	 * has nothing to unlock, and is offered the first run. A machine that has joined one lists what
	 * it has joined and asks for a password, which opens a vault on this machine with or without a
	 * network; there is no window to run out and no session to re-establish. *Three situations
	 * stood here until organizations: no account, a window closed after three days, and an identity
	 * with no session. Every one was about a control plane, and the control plane is what the
	 * organization replaces.*
	 *
	 * **Several organizations are rows a person picks from, drawn inside that shape.** A machine
	 * that has joined more than one shows each as a row carrying its name and the person's role
	 * there, one always chosen, the password field under the group. *A select stood here until
	 * effort 824: the one thing a person was choosing between was hidden behind a control, and the
	 * name and role of each were read only once the list was open. Chosen 2026-09-12 over the
	 * select and over remembering the last one.* One organization is named, not chosen.
	 *
	 * **The password field is the only field.** This machine already knows which member it is in
	 * each organization it joined, so an email typed here would be compared against a local string,
	 * which is exactly the check requirement 9 says a modified client can skip. The organization is
	 * chosen, the password is typed, and what the password opens is the whole of the sign-in.
	 *
	 * **The third way through is a link.** A person who was invited opens the link they were
	 * handed, and the operating system brings them to the join screen; one whose platform did not
	 * hand it over reaches the same screen from here and pastes it. Offered in both situations,
	 * because a machine that has joined one organization can be invited to a second.
	 */
	let {
		situation,
		organizations,
		isSigningIn,
		errorMessage,
		onSignIn,
		onSetUpOrganization,
		onJoinByLink
	}: {
		/** which of the two situations this is, from `organizationAdmission`. */
		situation: 'noOrganization' | 'locked';
		/** what this machine has joined, which is what it can unlock. */
		organizations: JoinedOrganization[];
		/** a password is being tried, which is a key derivation the person is waiting on. */
		isSigningIn: boolean;
		errorMessage: string | null;
		onSignIn: (organizationId: string, password: string) => void;
		/** the first run: an organization on the person's own Turso account. */
		onSetUpOrganization: () => void;
		/** the join screen: an invitation link, pasted or handed over by the operating system. */
		onJoinByLink: () => void;
	} = $props();

	let organizationId = $state<string>('');
	let password = $state('');

	// the one joined organization needs no choosing, and the first of several is the default.
	const chosen = $derived(
		organizations.find((organization) => organization.id === organizationId) ??
			organizations[0] ??
			null
	);

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

	const canUnlock = $derived(chosen !== null && password.length > 0 && !isSigningIn);

	const unlock = () => {
		if (!chosen || !canUnlock) return;

		onSignIn(chosen.id, password);
	};

	/**
	 * what the role reads as, in the reader's words. The vocabulary is
	 * `packages/workspace-permission`'s and a role this build has never heard of is shown as it
	 * is spelled rather than hidden.
	 */
	const roleLabel = (role: string) =>
		({
			owner: $LL.layout.signIn.roleOwner(),
			administrator: $LL.layout.signIn.roleAdministrator(),
			member: $LL.layout.signIn.roleMember()
		})[role] ?? role;
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
				{$LL.layout.signIn.setUpOrganization()}
			</Button>
			<Button variant="link" class="w-full justify-center" onclick={onJoinByLink}>
				{$LL.layout.signIn.openInvitation()}
			</Button>
		{:else}
			<form
				class="space-y-4"
				onsubmit={(event) => {
					event.preventDefault();
					unlock();
				}}
			>
				<Field.Field>
					{#if organizations.length > 1}
						<Field.Label id="sign-in-organization-label">
							{$LL.layout.signIn.organization()}
						</Field.Label>
						<!-- one row per organization, and the row is the radio's own label, so pressing
						     anywhere on it chooses. The group reads `chosen` and writes `organizationId`,
						     which is what `unlock()` reads through `chosen`, so the row pressed is the
						     organization unlocked. The composition is the field family's choice card:
						     a label around a horizontal field, which the label primitive already draws as
						     a bordered card and marks when the radio inside it is checked. Arrow keys move
						     the choice and one is always chosen; both come from the primitive. -->
						<RadioGroup.Root
							bind:value={() => chosen?.id ?? '', (value) => (organizationId = value)}
							aria-labelledby="sign-in-organization-label"
							disabled={isSigningIn}
							data-sign-in-organizations
						>
							{#each organizations as organization (organization.id)}
								<Field.Label for={`sign-in-organization-${organization.id}`}>
									<Field.Field orientation="horizontal">
										<RadioGroup.Item
											id={`sign-in-organization-${organization.id}`}
											value={organization.id}
										/>
										<Field.Content>
											<Field.Title>{organization.name}</Field.Title>
											<!-- the role this machine last saw for the person: a fact to recognise
											     oneself by, never authority. -->
											<Field.Description>{roleLabel(organization.role)}</Field.Description>
										</Field.Content>
									</Field.Field>
								</Field.Label>
							{/each}
						</RadioGroup.Root>
					{:else if chosen}
						<Field.Label for="sign-in-organization">{$LL.layout.signIn.organization()}</Field.Label>
						<!-- one organization, named rather than chosen, with the role this machine
						     last saw for the person: a fact to recognise oneself by, never authority. -->
						<p id="sign-in-organization" class="text-sm" data-sign-in-organization={chosen.id}>
							<span class="font-medium">{chosen.name}</span>
							<span class="text-muted-foreground"> · {roleLabel(chosen.role)}</span>
						</p>
					{/if}
				</Field.Field>

				<Field.Field>
					<Field.Label for="sign-in-password">{$LL.layout.signIn.password()}</Field.Label>
					<!-- the field's subject, as a leading glyph. The addon draws it in the muted
					     foreground so it does not outweigh the label beside it (Balance weight and
					     contrast, Refactoring UI p.56). It is the subject and never the error: a
					     validation error marks the label line, as the interface rule says. -->
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
				onclick={onJoinByLink}
				disabled={isSigningIn}
			>
				{$LL.layout.signIn.openInvitation()}
			</Button>

			<Button
				variant="link"
				class="w-full justify-center"
				onclick={onSetUpOrganization}
				disabled={isSigningIn}
			>
				{$LL.layout.signIn.setUpOrganization()}
			</Button>
		{/if}
	</div>
</StandaloneSurface>
