<script lang="ts">
	import FormSurface, { insetControl } from '@rentable/design/block/form-surface.svelte';
	import { Button } from '@rentable/design/primitive/button/index.js';
	import * as Field from '@rentable/design/primitive/field/index.js';
	import * as InputGroup from '@rentable/design/primitive/input-group/index.js';
	import { onSubmit } from '$lib/design/form';
	import { LL } from '$lib/i18n/i18n-svelte';
	import KeyRoundIcon from '@lucide/svelte/icons/key-round';
	import Trash2Icon from '@lucide/svelte/icons/trash-2';

	/**
	 * Deleting the organization, from the machine that holds the Turso account.
	 *
	 * **The owner's alone, and the area decides that**: the block this sits in is the owner's, and
	 * the shell refuses anybody else again on the role their password opened. What it deletes is
	 * every workspace database and the organization's own directory on the owner's account, and
	 * nothing puts either back.
	 *
	 * **Heavy, on the shared form surface** ([[rules/interface]], *Form surface*). It is a write
	 * and it takes a password, so it is the surface every other write takes rather than a confirm
	 * with a field bolted on; heavy because what a person has to read before they type is the
	 * whole of what goes, and the weight is declared rather than measured.
	 *
	 * **The body says what goes in the plainest words there are**, because this is the one act in
	 * the application that nothing undoes: every workspace and everything in it, every member's
	 * way in, and every other machine landing on the first screen the next time it opens.
	 *
	 * **A refusal marks the password** ([[rules/interface]], *Validation errors*). The shell
	 * refuses a password that does not open the owner's vault, so that is the field it belongs to,
	 * and the surface stays open with what was typed.
	 *
	 * **The mutation is the route's.** This owns the field and hands the password up through
	 * `onDelete`; the area closes it on a delete that went through and hands back the sentence on
	 * one that did not.
	 */
	let {
		open,
		onOpenChange,
		isDeleting,
		errorMessage,
		onDelete
	}: {
		open: boolean;
		onOpenChange: (value: boolean) => void;
		/** the deletes are running, which is a moment a person is waiting on. */
		isDeleting: boolean;
		/** what the shell refused the last attempt with, marked on the password. */
		errorMessage: string | null;
		onDelete: (password: string) => void;
	} = $props();

	let password = $state('');

	// nothing typed here outlives the surface: a password left in memory with nothing drawing it
	// is the one value this must not keep.
	$effect(() => {
		if (!open) {
			password = '';
		}
	});

	const canSubmit = $derived(password.length > 0 && !isDeleting);

	const enhance = onSubmit(() => {
		if (canSubmit) onDelete(password);
	});
</script>

<Field.Field orientation="vertical" data-delete-organization>
	<Field.Content>
		<Field.Description>
			{$LL.organization.dashboard.deleteOrganizationDescription()}
		</Field.Description>
	</Field.Content>

	<div>
		<!-- the verb's glyph before its label; outline rather than solid, since the act is offered
		     and never invited, and the destructive colour on the label rather than behind it, which
		     is the treatment every other loss in the application carries on a control like this. -->
		<Button
			type="button"
			variant="outline"
			class="text-destructive hover:text-destructive"
			data-delete-organization-open
			onclick={() => onOpenChange(true)}
		>
			<Trash2Icon class="size-4" />
			{$LL.organization.dashboard.deleteOrganization()}
		</Button>
	</div>
</Field.Field>

<FormSurface
	{open}
	{onOpenChange}
	{enhance}
	weight="heavy"
	title={$LL.organization.dashboard.deleteOrganization()}
>
	<div class="flex flex-col gap-4" data-delete-organization-form>
		<p class="text-sm text-muted-foreground">
			{$LL.organization.dashboard.deleteOrganizationGoes()}
		</p>

		<Field.Field>
			<Field.Label for="delete-organization-password">
				{$LL.organization.dashboard.deleteOrganizationPassword()}
			</Field.Label>
			<InputGroup.Root class={insetControl} data-disabled={isDeleting ? 'true' : undefined}>
				<InputGroup.Addon>
					<KeyRoundIcon />
				</InputGroup.Addon>
				<InputGroup.Input
					id="delete-organization-password"
					name="password"
					type="password"
					autocomplete="current-password"
					bind:value={password}
					disabled={isDeleting}
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
			disabled={isDeleting}
			onclick={() => onOpenChange(false)}
		>
			{$LL.common.actions.cancel()}
		</Button>
		<Button type="submit" variant="destructive" disabled={!canSubmit}>
			<Trash2Icon class="size-4" />
			{isDeleting ? $LL.common.actions.working() : $LL.organization.dashboard.deleteOrganization()}
		</Button>
	{/snippet}
</FormSurface>
