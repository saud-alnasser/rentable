<script lang="ts">
	import FieldError from '@rentable/design/block/field-error.svelte';
	import * as Form from '@rentable/design/primitive/form/index.js';
	import * as InputGroup from '@rentable/design/primitive/input-group/index.js';
	import { LL } from '$lib/i18n/i18n-svelte';
	import BriefcaseIcon from '@lucide/svelte/icons/briefcase';
	import type { SuperForm } from 'sveltekit-superforms';

	import type { WorkspaceForm } from '../workspace-form';

	/**
	 * The one field a workspace is named on, drawn wherever a workspace is named.
	 *
	 * **The fields and not the form.** The surfaces that ask for a name each own their `<form>`,
	 * because the form surface owns one and the standalone surface does not, so what they share
	 * is the schema in `../workspace-form.ts` and this: one text input inside the input group,
	 * with the workspace's glyph leading it and the field's own error beside it. The caller owns
	 * the `superForm` over that schema and hands it in.
	 *
	 * **The glyph is muted rather than as dark as the label.** An icon covers more surface than
	 * the text beside it and reads as emphasised at the same colour, so it is de-emphasised the
	 * one way an icon can be, by lowering its contrast (*Balance weight and contrast*,
	 * Refactoring UI p.56). The addon carries that colour itself.
	 *
	 * **It is the field's glyph and not the error's.** A validation error still marks this field
	 * the way [[rules/interface]] under *Validation errors* says: the destructive border the group
	 * draws from `aria-invalid`, and `FieldError`'s own icon on the label line.
	 */
	let {
		superform,
		disabled = false,
		class: className
	}: {
		superform: SuperForm<WorkspaceForm>;
		/** the surface is busy with the name it was given, and the field waits with it. */
		disabled?: boolean;
		/** classes for the group the input sits in, for a surface that insets its controls. */
		class?: string;
	} = $props();

	// read through the prop rather than destructured once, so the stores are the caller's current
	// form's and not the first one this was handed.
	const form = $derived(superform.form);
	const errors = $derived(superform.errors);
	const constraints = $derived(superform.constraints);
</script>

<Form.Field form={superform} name="name" class="group relative">
	<Form.Control>
		<Form.Label>{$LL.layout.noWorkspace.nameLabel()}</Form.Label>
		<InputGroup.Root class={className} data-disabled={disabled || undefined}>
			<InputGroup.Addon>
				<BriefcaseIcon />
			</InputGroup.Addon>
			<InputGroup.Input
				name="name"
				bind:value={$form.name}
				placeholder={$LL.layout.noWorkspace.nameLabel()}
				{disabled}
				aria-invalid={$errors.name ? 'true' : undefined}
				{...$constraints.name}
			/>
		</InputGroup.Root>
	</Form.Control>
	<FieldError />
</Form.Field>
