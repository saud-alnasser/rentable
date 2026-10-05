<script lang="ts">
	import FieldError from '@rentable/design/block/field-error.svelte';
	import PasswordInput from '@rentable/design/block/password-input.svelte';
	import { Button } from '@rentable/design/primitive/button/index.js';
	import * as Form from '@rentable/design/primitive/form/index.js';
	import { Input } from '@rentable/design/primitive/input/index.js';
	import DetailDisclosure from '$lib/error/component/detail-disclosure.svelte';
	import { LL } from '$lib/i18n/i18n-svelte';
	import { tick } from 'svelte';
	import type { SuperForm } from 'sveltekit-superforms';

	import type { WalkRefusal } from '../setup';

	/**
	 * The step that connects to the organization the account already holds (`walk.svelte`): the
	 * owner's own username and password. The walk holds the form, so what was typed outlives a
	 * visit to another step; this draws it.
	 */
	let {
		superform,
		isCreating,
		existingRefusal
	}: {
		/** the walk's form for the owner's own pair. */
		superform: SuperForm<{ username: string; password: string }>;
		/** the owner is being connected to the organization, until the loading surface takes over. */
		isCreating: boolean;
		/** why the last attempt was refused, against the password field, or `null`. */
		existingRefusal: WalkRefusal | null;
	} = $props();

	const {
		form: existingForm,
		constraints: existingConstraints,
		errors: existingErrors,
		enhance: existingEnhance
	} = $derived(superform);

	// arriving at the step puts the cursor in its first field (effort 843, requirement 8). The step
	// is drawn afresh on each arrival, so this runs once per visit.
	let firstField = $state<HTMLInputElement | null>(null);

	$effect(() => {
		if (!firstField) return;

		void tick().then(() => firstField?.focus());
	});
</script>

<!-- the owner's own pair, and nothing else. The sentence above the card already said
     whose account this is and who signs in here, so the fields are their labels and
     nothing more: this is a sign-in, and the person typing already knows what they are
     typing. A pair that opens nothing marks the password and says so
     under it, which is where a reader looks after pressing. -->
<form
	method="POST"
	use:existingEnhance
	class="flex flex-col gap-4 text-start"
	data-setup-fields="username,password"
>
	<Form.Field form={superform} name="username" class="group relative">
		<Form.Control>
			<Form.Label>{$LL.organization.setup.usernameLabel()}</Form.Label>
			<Input
				name="username"
				bind:value={$existingForm.username}
				placeholder={$LL.organization.setup.usernameLabel()}
				autocomplete="username"
				disabled={isCreating}
				aria-invalid={$existingErrors.username ? 'true' : undefined}
				{...$existingConstraints.username}
				class="h-9"
				bind:ref={firstField}
			/>
		</Form.Control>
		<FieldError />
	</Form.Field>

	<Form.Field form={superform} name="password" class="group relative">
		<Form.Control>
			<Form.Label>{$LL.organization.setup.passwordLabel()}</Form.Label>
			<PasswordInput
				name="password"
				bind:value={$existingForm.password}
				autocomplete="current-password"
				disabled={isCreating}
				aria-invalid={$existingErrors.password || existingRefusal ? 'true' : undefined}
				{...$existingConstraints.password}
				class="h-9"
			/>
		</Form.Control>
		<FieldError />
		{#if existingRefusal}
			<p class="text-sm text-destructive" data-setup-existing-refusal>
				{existingRefusal.sentence}
			</p>

			{#if existingRefusal.detail}
				<DetailDisclosure detail={existingRefusal.detail} name="existing" />
			{/if}
		{/if}
	</Form.Field>

	<Button type="submit" size="lg" class="w-full" disabled={isCreating}>
		<span class="first-letter:uppercase">
			{isCreating ? $LL.common.actions.working() : $LL.organization.setup.existingConnect()}
		</span>
	</Button>
</form>
