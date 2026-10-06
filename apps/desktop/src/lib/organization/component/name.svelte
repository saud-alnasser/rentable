<script lang="ts">
	import type { OrganizationSession } from '$lib/organization/host';
	import SettingsGroup from '@rentable/design/block/settings-group.svelte';
	import { Button } from '@rentable/design/primitive/button/index.js';
	import { LL } from '$lib/i18n/i18n-svelte';
	import OrganizationRenameForm from '$lib/organization/component/rename-form.svelte';
	import OrganizationTile from '$lib/organization/component/tile.svelte';

	/**
	 * The organization tab's first card: what the organization is called (effort 851, requirements
	 * 22 and 25).
	 *
	 * **The name is the card's title, led by the organization's tile**, as the account tab opens on
	 * the reader's own name led by their avatar (`session/component/identity.svelte`): a tab opens
	 * on what it is about. The tile is the one the switcher draws on the wall, so the reader meets
	 * the same square for the same organization. The name is drawn as written, isolated, since it
	 * is somebody's own word.
	 *
	 * **The owner alone meets the edit**, the card's one act on itself, quiet words at the header's
	 * trailing edge as the password card's *change* is ([[rules/interface]], *Settings section*),
	 * named for the whole act, opening the light rename form. Nobody else meets it, a manager and a
	 * member holding every flag included: no flag carries the rename, so there is nothing to draw
	 * refused with a reason, and the card's line says instead who can change the name. Rust refuses
	 * anybody else's rename again on their verified row (requirement 24).
	 */
	let { session }: { session: OrganizationSession } = $props();

	const isOwner = $derived(session.role === 'owner');

	let renaming = $state(false);
</script>

{#snippet tile()}
	<OrganizationTile name={session.organizationName} size="card" />
{/snippet}

{#snippet edit()}
	<Button
		type="button"
		variant="ghost"
		size="sm"
		aria-label={$LL.organization.name.edit()}
		data-organization-rename-open
		onclick={() => {
			renaming = true;
		}}
	>
		{$LL.common.actions.edit()}
	</Button>
{/snippet}

<div data-organization-name class="contents">
	<SettingsGroup
		media={tile}
		title={session.organizationName}
		titleAsWritten
		description={isOwner
			? $LL.organization.name.description()
			: `${$LL.organization.name.description()} ${$LL.organization.name.readOnly()}`}
		action={isOwner ? edit : undefined}
	/>
</div>

{#if isOwner}
	<OrganizationRenameForm
		name={session.organizationName}
		open={renaming}
		onOpenChange={(open) => {
			renaming = open;
		}}
	/>
{/if}
