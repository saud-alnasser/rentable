<script lang="ts">
	import FieldError from '@rentable/design/block/field-error.svelte';
	import { Button } from '@rentable/design/primitive/button/index.js';
	import * as Form from '@rentable/design/primitive/form/index.js';
	import * as InputGroup from '@rentable/design/primitive/input-group/index.js';
	import DetailDisclosure from '$lib/error/component/detail-disclosure.svelte';
	import { LL } from '$lib/i18n/i18n-svelte';
	import KeyRoundIcon from '@lucide/svelte/icons/key-round';
	import PlugIcon from '@lucide/svelte/icons/plug';
	import UserIcon from '@lucide/svelte/icons/user';
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
</script>

<!-- the owner's own pair, and nothing else. The sentence above the card already said
     whose account this is and who signs in here, so the fields carry their subject's
     glyph and no description: this is a sign-in, and the person typing already knows
     what they are typing. A pair that opens nothing marks the password and says so
     under it, which is where a reader looks after pressing. -->
<form method="POST" use:existingEnhance class="space-y-4" data-setup-fields="username,password">
	<Form.Field form={superform} name="username" class="group relative">
		<Form.Control>
			<Form.Label>{$LL.organization.setup.usernameLabel()}</Form.Label>
			<InputGroup.Root data-disabled={isCreating || undefined}>
				<InputGroup.Addon>
					<UserIcon />
				</InputGroup.Addon>
				<InputGroup.Input
					name="username"
					bind:value={$existingForm.username}
					placeholder={$LL.organization.setup.usernameLabel()}
					autocomplete="username"
					disabled={isCreating}
					aria-invalid={$existingErrors.username ? 'true' : undefined}
					{...$existingConstraints.username}
				/>
			</InputGroup.Root>
		</Form.Control>
		<FieldError />
	</Form.Field>

	<Form.Field form={superform} name="password" class="group relative">
		<Form.Control>
			<Form.Label>{$LL.organization.setup.passwordLabel()}</Form.Label>
			<InputGroup.Root data-disabled={isCreating || undefined}>
				<InputGroup.Addon>
					<KeyRoundIcon />
				</InputGroup.Addon>
				<InputGroup.Input
					name="password"
					type="password"
					bind:value={$existingForm.password}
					autocomplete="current-password"
					disabled={isCreating}
					aria-invalid={$existingErrors.password || existingRefusal ? 'true' : undefined}
					{...$existingConstraints.password}
				/>
			</InputGroup.Root>
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

	<Button type="submit" class="w-full justify-center" disabled={isCreating}>
		<PlugIcon class="size-4" />
		{isCreating ? $LL.common.actions.working() : $LL.organization.setup.existingConnect()}
	</Button>
</form>
