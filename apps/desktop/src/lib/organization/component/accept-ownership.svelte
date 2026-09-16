<script lang="ts">
	import FormSurface, { insetControl } from '@rentable/design/block/form-surface.svelte';
	import { Button } from '@rentable/design/primitive/button/index.js';
	import * as Field from '@rentable/design/primitive/field/index.js';
	import * as InputGroup from '@rentable/design/primitive/input-group/index.js';
	import { onSubmit } from '$lib/design/form';
	import { LL } from '$lib/i18n/i18n-svelte';
	import CrownIcon from '@lucide/svelte/icons/crown';
	import KeyRoundIcon from '@lucide/svelte/icons/key-round';

	/**
	 * Accepting the organization that was offered to this reader: the second of the two acts a
	 * handover is (effort 828, requirement 22).
	 *
	 * **Heavy, on the shared form surface** ([[rules/interface]], *Form surface*), for the reason
	 * the offer beside it is: it is a write, it takes a password, and what a person has to read
	 * before they type is the whole of what changes.
	 *
	 * **The body says the two things a person would not guess.** The first is what their password
	 * becomes: the organization is signed with what their own vault derives from here on, so their
	 * password is what gets them back in on a new machine, in place of the person who offered it.
	 * The second is that the Turso account does not come with the organization, which is the same
	 * sentence the offer carries and is said again here because these are two different people
	 * reading two different screens.
	 *
	 * **There is one field and no chooser.** An offer stands with one account or with none, and
	 * this is only ever drawn for the account it stands with, so there is nothing to pick.
	 *
	 * **A refusal marks the password** ([[rules/interface]], *Validation errors*). The shell
	 * refuses a password that does not open this reader's vault, and it refuses an offer whose
	 * seal is not the key this machine holds; both are said on the field the person can act on,
	 * and the surface stays open.
	 *
	 * **The mutation is the caller's.** This owns the one field and hands the password up through
	 * `onAccept`.
	 */
	let {
		open,
		onOpenChange,
		organizationName,
		ownerUsername,
		isAccepting,
		errorMessage,
		onAccept
	}: {
		open: boolean;
		onOpenChange: (value: boolean) => void;
		/** what the organization is called, which is what is being accepted. */
		organizationName: string;
		/** who offered it, which is who becomes an administrator. */
		ownerUsername: string;
		/** the acceptance is running: a re-key and a push, which is a moment to wait on. */
		isAccepting: boolean;
		/** what the shell refused the last attempt with, marked on the password. */
		errorMessage: string | null;
		onAccept: (password: string) => void;
	} = $props();

	let password = $state('');

	// nothing typed here outlives the surface: a password left in memory with nothing drawing it
	// is the one value this must not keep.
	$effect(() => {
		if (!open) password = '';
	});

	const canSubmit = $derived(password.length > 0 && !isAccepting);

	const enhance = onSubmit(() => {
		if (canSubmit) onAccept(password);
	});
</script>

<FormSurface
	{open}
	{onOpenChange}
	{enhance}
	weight="heavy"
	title={$LL.organization.dashboard.acceptOwnership()}
>
	<div class="flex flex-col gap-4" data-accept-ownership-form>
		<p class="text-sm text-muted-foreground" data-accept-ownership-goes>
			{$LL.organization.dashboard.acceptOwnershipGoes({
				organization: organizationName,
				owner: ownerUsername
			})}
		</p>

		<!-- the Turso account is the half of this a person would not guess, so it stands on its own
		     line rather than inside the paragraph above. -->
		<p class="text-sm text-muted-foreground" data-accept-ownership-authority>
			{$LL.organization.dashboard.acceptOwnershipAuthority()}
		</p>

		<Field.Field>
			<Field.Label for="accept-ownership-password">
				{$LL.organization.dashboard.acceptOwnershipPassword()}
			</Field.Label>
			<InputGroup.Root class={insetControl} data-disabled={isAccepting ? 'true' : undefined}>
				<InputGroup.Addon>
					<KeyRoundIcon />
				</InputGroup.Addon>
				<InputGroup.Input
					id="accept-ownership-password"
					name="password"
					type="password"
					autocomplete="current-password"
					bind:value={password}
					disabled={isAccepting}
					aria-invalid={errorMessage ? 'true' : undefined}
				/>
			</InputGroup.Root>
			{#if errorMessage}
				<Field.Error>{errorMessage}</Field.Error>
			{/if}
		</Field.Field>
	</div>

	{#snippet actions()}
		<Button
			type="button"
			variant="outline"
			disabled={isAccepting}
			onclick={() => onOpenChange(false)}
		>
			{$LL.common.actions.cancel()}
		</Button>
		<Button type="submit" disabled={!canSubmit}>
			<CrownIcon class="size-4" />
			{isAccepting
				? $LL.common.actions.working()
				: $LL.organization.dashboard.acceptOwnershipConfirm()}
		</Button>
	{/snippet}
</FormSurface>
