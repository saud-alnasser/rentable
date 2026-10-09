<script lang="ts">
	import FormSurface, { insetControl } from '@rentable/design/block/form-surface.svelte';
	import PasswordInput from '@rentable/design/block/password-input.svelte';
	import { Button } from '@rentable/design/primitive/button/index.js';
	import * as Field from '@rentable/design/primitive/field/index.js';
	import { isDirty, onSubmit } from '$lib/form';
	import { LL } from '$lib/i18n/i18n-svelte';
	import { PASSWORD_FLOOR } from '$lib/organization/setup/setup';
	import RefreshCwIcon from '@lucide/svelte/icons/refresh-cw';
	import { untrack } from 'svelte';

	/**
	 * Choosing a password: the current one, and the new one, checked against the floor.
	 *
	 * **Light, on the shared form surface** ([[rules/interface]], *Form surface*). Changing a
	 * password is a write, and until effort 828 it was three empty password fields drawn under a
	 * heading on every visit to the you section, whether or not the person came to change
	 * anything. Nothing about the password is on screen now until they ask for it; the section
	 * states the fact and this is the write. Three fields is the light weight, declared rather
	 * than measured, so it is a centred panel that fills the width it has below the breakpoint.
	 *
	 * **The floor is explained, and there is no meter.** There is no server to slow a guess down,
	 * so the length of the password is the whole of what stands between anybody holding the
	 * organization's records and reading them; a meter would say that a short password is weak,
	 * and the truth is that it is the only defence there is. The sentence says so.
	 *
	 * **A refusal marks the current password** ([[rules/interface]], *Validation errors*). What the
	 * shell refuses this with is that the current password did not open the vault, so that is the
	 * field it belongs to, and the surface stays open with what was typed. *A callout above the
	 * fields carried it until effort 828, which is the summary the rule is against: it named the
	 * problem and never the field.*
	 *
	 * **The three fields carry the password's glyph, muted, and the button its verb's.** The key is
	 * what every password field in the application leads with, the wall's and the walk's among
	 * them, so a person reads the same subject wherever they type one. It is drawn in the muted
	 * foreground because an icon covers more surface than the label beside it and reads as
	 * emphasised at the same colour (*Balance weight and contrast*, Refactoring UI p.56).
	 *
	 * **The mutation is the host's.** This owns the surface and what is typed on it and hands the
	 * pair up through `onChange`; the area runs the change, closes this on a change that went
	 * through and hands back the sentence on one that did not.
	 */
	let {
		open,
		onOpenChange,
		currentLabel,
		isChanging,
		errorMessage,
		onChange
	}: {
		open: boolean;
		onOpenChange: (value: boolean) => void;
		/** what the current password is called here: the one handed over, or their own. */
		currentLabel: string;
		/** two derivations are running, which is a moment a person is waiting on. */
		isChanging: boolean;
		/** what the shell refused the last attempt with, marked on the current password. */
		errorMessage: string | null;
		onChange: (current: string, next: string) => void;
	} = $props();

	let current = $state('');
	let next = $state('');
	let confirmation = $state('');

	/** what a close would lose: the three fields. */
	const edits = () => ({ current, next, confirmation });

	/** what the fields held when the dialog opened, which a close is measured against. */
	let opened = $state.raw<ReturnType<typeof edits>>();

	// nothing typed here outlives the surface. A change that went through is closed by the host
	// and a cancel is closed by the surface, and either way three passwords are left in memory
	// with nothing drawing them.
	$effect(() => {
		if (!open) {
			current = '';
			next = '';
			confirmation = '';
		} else {
			opened = untrack(() => $state.snapshot(edits()));
		}
	});

	// anything typed asks before the dialog closes (effort 861, requirement 10), and a field
	// typed in and emptied again is no change (`form/dirty.ts`).
	const dirty = $derived(isDirty(opened, $state.snapshot(edits())));

	const tooShort = $derived(next.length > 0 && next.length < PASSWORD_FLOOR);
	const mismatch = $derived(confirmation.length > 0 && confirmation !== next);
	const canSubmit = $derived(
		current.length > 0 && next.length >= PASSWORD_FLOOR && confirmation === next && !isChanging
	);

	const enhance = onSubmit(() => {
		if (canSubmit) onChange(current, next);
	});
</script>

<FormSurface
	{open}
	{onOpenChange}
	{dirty}
	{enhance}
	weight="light"
	title={$LL.settings.you.password.change()}
>
	<div class="flex flex-col gap-4" data-change-password>
		<Field.Field>
			<Field.Label for="password-current">{currentLabel}</Field.Label>
			<PasswordInput
				id="password-current"
				name="current"
				autocomplete="current-password"
				bind:value={current}
				disabled={isChanging}
				aria-invalid={errorMessage ? 'true' : undefined}
				class={insetControl}
				lead
			/>
			{#if errorMessage}
				<Field.Error>{errorMessage}</Field.Error>
			{/if}
		</Field.Field>

		<Field.Field>
			<Field.Label for="password-next">{$LL.settings.you.password.nextLabel()}</Field.Label>
			<PasswordInput
				id="password-next"
				name="next"
				autocomplete="new-password"
				bind:value={next}
				disabled={isChanging}
				aria-invalid={tooShort}
				class={insetControl}
				lead
			/>
			<Field.Description>{$LL.organization.setup.passwordFloor()}</Field.Description>
			{#if tooShort}
				<Field.Error>{$LL.organization.setup.passwordTooShort()}</Field.Error>
			{/if}
		</Field.Field>

		<Field.Field>
			<Field.Label for="password-confirmation"
				>{$LL.settings.you.password.confirmLabel()}</Field.Label
			>
			<PasswordInput
				id="password-confirmation"
				name="confirmation"
				autocomplete="new-password"
				bind:value={confirmation}
				disabled={isChanging}
				aria-invalid={mismatch}
				class={insetControl}
				lead
			/>
			{#if mismatch}
				<Field.Error>{$LL.settings.you.password.mismatch()}</Field.Error>
			{/if}
		</Field.Field>
	</div>

	{#snippet actions({ requestClose })}
		<Button type="button" variant="outline" disabled={isChanging} onclick={requestClose}>
			{$LL.common.actions.cancel()}
		</Button>
		<!-- the verb's glyph before its label, as every primary here carries one. -->
		<Button type="submit" disabled={!canSubmit}>
			<RefreshCwIcon class="size-4" />
			{isChanging ? $LL.common.actions.working() : $LL.settings.you.password.change()}
		</Button>
	{/snippet}
</FormSurface>
