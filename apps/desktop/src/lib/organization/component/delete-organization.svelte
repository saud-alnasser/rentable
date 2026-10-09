<script lang="ts">
	import FormSurface, { insetControl } from '@rentable/design/block/form-surface.svelte';
	import SettingsRow from '@rentable/design/block/settings-row.svelte';
	import PasswordInput from '@rentable/design/block/password-input.svelte';
	import { Button } from '@rentable/design/primitive/button/index.js';
	import * as Field from '@rentable/design/primitive/field/index.js';
	import { tone } from '@rentable/design/tone.js';
	import { isDirty, onSubmit } from '$lib/form';
	import { LL } from '$lib/i18n/i18n-svelte';
	import Trash2Icon from '@lucide/svelte/icons/trash-2';
	import { untrack } from 'svelte';

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
	 * **The last row of the leaving group, set apart from the disconnect before it** (effort 846,
	 * requirements 2 and 14): an error row with its glyph, and under its name the one line saying the
	 * organization and every workspace go from the Turso account and nothing puts them back. The
	 * row's name is the act and labels the button, whose own word is the verb alone, red and with
	 * no glyph, since the row's glyph already says what it is about (ticket 38).
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

	/** what the password held when the form opened, which a close is measured against. */
	let opened = $state.raw<string>();

	// nothing typed here outlives the surface: a password left in memory with nothing drawing it
	// is the one value this must not keep.
	$effect(() => {
		if (!open) {
			password = '';
		} else {
			opened = untrack(() => $state.snapshot(password));
		}
	});

	// a typed password asks before the form closes (effort 861, requirement 10).
	const dirty = $derived(isDirty(opened, $state.snapshot(password)));

	const canSubmit = $derived(password.length > 0 && !isDeleting);

	const enhance = onSubmit(() => {
		if (canSubmit) onDelete(password);
	});
</script>

{#snippet consequence()}
	<span data-leaving-consequence>
		{$LL.organization.dashboard.deleteOrganizationDescription()}
	</span>
{/snippet}

<SettingsRow
	icon={Trash2Icon}
	name={$LL.organization.dashboard.deleteOrganization()}
	tone="error"
	meta={consequence}
>
	{#snippet control({ labelId })}
		<!-- the row carries no mark of its own, so the act's two marks are on its one control: the
		     act (`data-delete-organization`), which the section's order is read by, and what opens
		     it. -->
		<Button
			type="button"
			variant="ghost"
			size="sm"
			class="{tone({ tone: 'error' }).text()} hover:bg-destructive/10 hover:text-destructive"
			aria-labelledby={labelId}
			data-delete-organization
			data-delete-organization-open
			onclick={() => onOpenChange(true)}
		>
			{$LL.common.actions.delete()}
		</Button>
	{/snippet}
</SettingsRow>

<FormSurface
	{open}
	{onOpenChange}
	{dirty}
	{enhance}
	weight="heavy"
	title={$LL.organization.dashboard.deleteOrganization()}
>
	<div class="flex flex-col gap-4" data-delete-organization-form>
		<p class="text-sm text-muted-foreground">
			{$LL.organization.dashboard.deleteOrganizationGoes()}
		</p>

		<Field.Field>
			<!-- the key the first run wrote the term on, drawn rather than said again here: one
			     english word per thing, and one key holding it (effort 826, requirement 18). -->
			<Field.Label for="delete-organization-password">
				{$LL.organization.setup.passwordLabel()}
			</Field.Label>
			<PasswordInput
				id="delete-organization-password"
				name="password"
				autocomplete="current-password"
				bind:value={password}
				disabled={isDeleting}
				aria-invalid={errorMessage ? 'true' : undefined}
				class={insetControl}
				lead
			/>
			{#if errorMessage}
				<Field.Error>{errorMessage}</Field.Error>
			{/if}
		</Field.Field>
	</div>

	{#snippet actions({ requestClose })}
		<Button type="button" variant="outline" disabled={isDeleting} onclick={requestClose}>
			{$LL.common.actions.cancel()}
		</Button>
		<Button type="submit" variant="destructive" disabled={!canSubmit}>
			<Trash2Icon class="size-4" />
			{isDeleting ? $LL.common.actions.working() : $LL.organization.dashboard.deleteOrganization()}
		</Button>
	{/snippet}
</FormSurface>
