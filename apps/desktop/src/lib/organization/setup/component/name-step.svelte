<script lang="ts">
	import FieldError from '@rentable/design/block/field-error.svelte';
	import { Button } from '@rentable/design/primitive/button/index.js';
	import { Callout } from '@rentable/design/primitive/callout/index.js';
	import * as Form from '@rentable/design/primitive/form/index.js';
	import * as InputGroup from '@rentable/design/primitive/input-group/index.js';
	import DetailDisclosure from '$lib/error/component/detail-disclosure.svelte';
	import { LL } from '$lib/i18n/i18n-svelte';
	import BuildingIcon from '@lucide/svelte/icons/building';
	import KeyRoundIcon from '@lucide/svelte/icons/key-round';
	import LayersIcon from '@lucide/svelte/icons/layers';
	import PlusIcon from '@lucide/svelte/icons/plus';
	import UserIcon from '@lucide/svelte/icons/user';
	import type { SuperForm } from 'sveltekit-superforms';

	import type { SetupField } from '../setup';

	/**
	 * The step that names the organization (`walk.svelte`): the fields the walk's description
	 * names, and the Turso group where the walk was asked to collect one. The walk holds the form,
	 * so what was typed outlives a visit to another step; this draws it.
	 */
	let {
		superform,
		fields,
		askGroup,
		groupDetail,
		isCreating
	}: {
		/** the walk's form for the organization's name, the owner's username and password. */
		superform: SuperForm<{ name: string; username: string; password: string; group: string }>;
		/** the fields the walk presents, in its description's order. */
		fields: readonly SetupField[];
		/** whether the step has to ask for the Turso group. */
		askGroup: boolean;
		/** Turso's own account of why the group is being asked for, or `null`. */
		groupDetail: string | null;
		/** the organization is being created, until the loading surface takes over. */
		isCreating: boolean;
	} = $props();

	const { form, constraints, errors, enhance } = $derived(superform);
</script>

<!-- the three fields, and they are the three the walk description names. A fourth would
     render here only if it were added to `SETUP_WALK`, which is what the test reads,
     or where Turso has left the group to be asked for, which is the block at the foot
     of the form. Each carries its subject's glyph ahead of the input, muted so it does
     not outweigh the label (*Balance weight and contrast*, p.56); the error still
     marks the label line, which is the field's own treatment. -->
<form method="POST" use:enhance class="space-y-4" data-setup-fields={fields.join(',')}>
	{#if fields.includes('name')}
		<Form.Field form={superform} name="name" class="group relative">
			<Form.Control>
				<Form.Label>{$LL.organization.setup.nameLabel()}</Form.Label>
				<InputGroup.Root data-disabled={isCreating || undefined}>
					<InputGroup.Addon>
						<BuildingIcon />
					</InputGroup.Addon>
					<InputGroup.Input
						name="name"
						bind:value={$form.name}
						placeholder={$LL.organization.setup.nameLabel()}
						autocomplete="organization"
						disabled={isCreating}
						aria-invalid={$errors.name ? 'true' : undefined}
						{...$constraints.name}
					/>
				</InputGroup.Root>
			</Form.Control>
			<FieldError />
		</Form.Field>
	{/if}

	{#if fields.includes('username')}
		<Form.Field form={superform} name="username" class="group relative">
			<Form.Control>
				<Form.Label>{$LL.organization.setup.usernameLabel()}</Form.Label>
				<InputGroup.Root data-disabled={isCreating || undefined}>
					<InputGroup.Addon>
						<UserIcon />
					</InputGroup.Addon>
					<InputGroup.Input
						name="username"
						bind:value={$form.username}
						placeholder={$LL.organization.setup.usernameLabel()}
						autocomplete="username"
						disabled={isCreating}
						aria-invalid={$errors.username ? 'true' : undefined}
						{...$constraints.username}
					/>
				</InputGroup.Root>
			</Form.Control>
			<FieldError />
		</Form.Field>
	{/if}

	{#if fields.includes('password')}
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
						bind:value={$form.password}
						autocomplete="new-password"
						disabled={isCreating}
						aria-invalid={$errors.password ? 'true' : undefined}
						{...$constraints.password}
					/>
				</InputGroup.Root>
			</Form.Control>
			<Form.Description>{$LL.organization.setup.passwordFloor()}</Form.Description>
			<FieldError />
		</Form.Field>
	{/if}

	{#if askGroup}
		<!-- the last resort, and the only Turso word the walk ever asks for. Turso would
		     take none of the names this application can work out, so the person who
		     picked the group on Turso's own consent screen is asked which it was. The
		     connect step said this step was coming, so the sentence above the field
		     says what to type rather than what went wrong, and its tone is `info`
		     rather than a warning for the same reason. The one under the field says
		     where the name reads. Neither tells anybody to do anything about a group. -->
		<div class="space-y-4" data-setup-group>
			<div class="space-y-2">
				<Callout tone="info">{$LL.organization.setup.groupNeeded()}</Callout>

				{#if groupDetail}
					<!-- Turso's own words, beneath the sentence, behind a disclosure and
					     quieter than it (*Balance weight and contrast*, Refactoring UI
					     p.56): the sentence is what a person acts on, and this is what
					     they would quote to somebody else, in Turso's English whatever
					     the locale is. -->
					<DetailDisclosure detail={groupDetail} name="group" />
				{/if}
			</div>

			<Form.Field form={superform} name="group" class="group relative">
				<Form.Control>
					<Form.Label>{$LL.organization.setup.groupLabel()}</Form.Label>
					<InputGroup.Root data-disabled={isCreating || undefined}>
						<InputGroup.Addon>
							<LayersIcon />
						</InputGroup.Addon>
						<InputGroup.Input
							name="group"
							bind:value={$form.group}
							placeholder={$LL.organization.setup.groupLabel()}
							autocomplete="off"
							disabled={isCreating}
							aria-invalid={$errors.group ? 'true' : undefined}
							{...$constraints.group}
						/>
					</InputGroup.Root>
				</Form.Control>
				<Form.Description>{$LL.organization.setup.groupDescription()}</Form.Description>
				<FieldError />
			</Form.Field>
		</div>
	{/if}

	<Button type="submit" class="w-full justify-center" disabled={isCreating}>
		<PlusIcon class="size-4" />
		{isCreating ? $LL.common.actions.working() : $LL.organization.setup.create()}
	</Button>
</form>
