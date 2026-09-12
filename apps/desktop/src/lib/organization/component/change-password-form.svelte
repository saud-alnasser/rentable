<script lang="ts">
	import { Button } from '@rentable/design/primitive/button/index.js';
	import { Callout } from '@rentable/design/primitive/callout/index.js';
	import * as Field from '@rentable/design/primitive/field/index.js';
	import { Input } from '@rentable/design/primitive/input/index.js';
	import { LL } from '$lib/i18n/i18n-svelte';
	import { PASSWORD_FLOOR } from '$lib/organization/setup';

	/**
	 * Choosing a password: the current one, and the new one, checked against the floor.
	 *
	 * **The floor is explained, and there is no meter.** There is no server to slow a guess down,
	 * so the length of the password is the whole of what stands between anybody holding the
	 * organization's records and reading them; a meter would say that a short password is weak,
	 * and the truth is that it is the only defence there is. The sentence says so.
	 *
	 * One form for the two places it is drawn: the screen a joined member meets before anything
	 * else, where the current password is the one they were handed, and the account page, where
	 * it is their own. The shell checks the current password against the vault either way.
	 */
	let {
		currentLabel,
		isChanging,
		errorMessage,
		onChange
	}: {
		/** what the current password is called here: the one handed over, or their own. */
		currentLabel: string;
		/** two derivations are running, which is a moment a person is waiting on. */
		isChanging: boolean;
		errorMessage: string | null;
		onChange: (current: string, next: string) => void;
	} = $props();

	let current = $state('');
	let next = $state('');
	let confirmation = $state('');

	const tooShort = $derived(next.length > 0 && next.length < PASSWORD_FLOOR);
	const mismatch = $derived(confirmation.length > 0 && confirmation !== next);
	const canSubmit = $derived(
		current.length > 0 && next.length >= PASSWORD_FLOOR && confirmation === next && !isChanging
	);

	export function reset() {
		current = '';
		next = '';
		confirmation = '';
	}
</script>

<form
	class="space-y-4"
	data-change-password
	onsubmit={(event) => {
		event.preventDefault();

		if (canSubmit) onChange(current, next);
	}}
>
	{#if errorMessage}
		<Callout tone="error">{errorMessage}</Callout>
	{/if}

	<Field.Field>
		<Field.Label for="password-current">{currentLabel}</Field.Label>
		<Input
			id="password-current"
			name="current"
			type="password"
			autocomplete="current-password"
			bind:value={current}
			disabled={isChanging}
		/>
	</Field.Field>

	<Field.Field>
		<Field.Label for="password-next">{$LL.account.password.nextLabel()}</Field.Label>
		<Input
			id="password-next"
			name="next"
			type="password"
			autocomplete="new-password"
			bind:value={next}
			disabled={isChanging}
			aria-invalid={tooShort}
		/>
		<Field.Description>{$LL.organization.setup.passwordFloor()}</Field.Description>
		{#if tooShort}
			<Field.Error>{$LL.organization.setup.passwordTooShort()}</Field.Error>
		{/if}
	</Field.Field>

	<Field.Field>
		<Field.Label for="password-confirmation">{$LL.account.password.confirmLabel()}</Field.Label>
		<Input
			id="password-confirmation"
			name="confirmation"
			type="password"
			autocomplete="new-password"
			bind:value={confirmation}
			disabled={isChanging}
			aria-invalid={mismatch}
		/>
		{#if mismatch}
			<Field.Error>{$LL.account.password.mismatch()}</Field.Error>
		{/if}
	</Field.Field>

	<Button type="submit" class="w-full justify-center sm:w-auto" disabled={!canSubmit}>
		{isChanging ? $LL.common.actions.working() : $LL.account.password.change()}
	</Button>
</form>
