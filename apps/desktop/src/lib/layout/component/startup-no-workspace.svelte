<script lang="ts">
	import StandaloneSurface from '@rentable/design/block/standalone-surface.svelte';
	import { Button } from '@rentable/design/primitive/button/index.js';
	import * as Field from '@rentable/design/primitive/field/index.js';
	import { Input } from '@rentable/design/primitive/input/index.js';
	import { LL } from '$lib/i18n/i18n-svelte';

	/**
	 * A member who is in, with nowhere to go yet.
	 *
	 * An organization whose owner has not created a workspace yet admits its members to nothing
	 * behind the wall, and this is what it draws: the organization's name, a sentence saying so, and
	 * the one way past it, which is the owner's. **The form is drawn for the owner and a sentence
	 * for everybody else**, because creating a workspace needs the Turso authority only the owner's
	 * machine holds; the shell refuses anybody else at the command regardless, and this is the
	 * screen saying the same thing before they press anything.
	 *
	 * On the application surface rather than a route, because it presents the application's own
	 * state, and over every address, because there is no workspace for any address to draw from.
	 */
	let {
		organizationName,
		canCreate,
		isCreating,
		onCreate
	}: {
		organizationName: string;
		/** whether the person is the owner, which is who a create is for. */
		canCreate: boolean;
		isCreating: boolean;
		onCreate: (name: string) => void;
	} = $props();

	let name = $state('');

	const canSubmit = $derived(canCreate && name.trim().length > 0 && !isCreating);
</script>

<StandaloneSurface
	tone="neutral"
	title={$LL.layout.noWorkspace.title()}
	description={$LL.layout.noWorkspace.description()}
	busy={isCreating}
>
	<div class="space-y-4 pt-2">
		<p class="text-sm font-medium" data-no-workspace-organization>{organizationName}</p>

		{#if canCreate}
			<form
				class="space-y-4"
				onsubmit={(event) => {
					event.preventDefault();

					if (canSubmit) onCreate(name.trim());
				}}
			>
				<Field.Field>
					<Field.Label for="workspace-name">{$LL.layout.noWorkspace.nameLabel()}</Field.Label>
					<Input
						id="workspace-name"
						name="name"
						bind:value={name}
						placeholder={$LL.layout.noWorkspace.nameLabel()}
						disabled={isCreating}
					/>
				</Field.Field>

				<Button type="submit" class="w-full justify-center" disabled={!canSubmit}>
					{isCreating ? $LL.common.actions.working() : $LL.layout.noWorkspace.create()}
				</Button>
			</form>

			{#if isCreating}
				<p class="text-center text-sm text-muted-foreground">
					{$LL.layout.noWorkspace.creating()}
				</p>
			{/if}
		{:else}
			<p class="text-sm text-muted-foreground">{$LL.layout.noWorkspace.ownerOnly()}</p>
		{/if}
	</div>
</StandaloneSurface>
