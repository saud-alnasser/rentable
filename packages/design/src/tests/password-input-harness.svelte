<script lang="ts">
	/**
	 * The password field inside a form with its own submit button, as every surface draws one.
	 *
	 * Scaffolding rather than a test: the block's place in a form is what Enter is checked against,
	 * and the reading direction is set on the box around it, as the window sets it. The provider
	 * above it supplies the eye's name, `showPassword`, as `name`.
	 */
	import PasswordInput from '#lib/block/password-input.svelte';
	import { DesignProvider } from '#lib/strings.js';
	import { suppliedStrings } from '#tests/contract-strings.js';

	let {
		dir = 'ltr',
		name = 'show password',
		disabled = false,
		lead = false,
		value = $bindable(''),
		onsubmit
	}: {
		dir?: 'ltr' | 'rtl';
		name?: string;
		disabled?: boolean;
		lead?: boolean;
		value?: string;
		onsubmit?: () => void;
	} = $props();
</script>

<DesignProvider strings={suppliedStrings({ showPassword: name })} direction={dir}>
	<div {dir}>
		<form
			onsubmit={(event) => {
				event.preventDefault();
				onsubmit?.();
			}}
		>
			<PasswordInput
				id="harness-password"
				name="password"
				autocomplete="current-password"
				class="h-9"
				{disabled}
				{lead}
				bind:value
			/>
			<button type="submit">sign in</button>
		</form>
	</div>
</DesignProvider>
