<script lang="ts">
	import SettingsRow from '@rentable/design/block/settings-row.svelte';
	import { Button } from '@rentable/design/primitive/button/index.js';
	import { LL } from '$lib/i18n/i18n-svelte';
	import { openUpgrade } from '$lib/organization/upgrade/sheet.svelte';
	import DatabaseArrowUpIcon from '@lucide/svelte/icons/database-arrow-up';

	/**
	 * The organization's upgrade, marked on its card for whoever may run it (effort 857,
	 * requirement 3, ticket 08): one row of the card, led by the glyph of the permission it takes,
	 * named *upgrade available*, its line saying the reader sees who it affects before anything
	 * changes, and *review*, in words, opening the sheet on the organization.
	 *
	 * **Whether it is drawn is the card's** (`../../component/name.svelte`), which reads what waits
	 * for whoever may run it and nobody else.
	 */
</script>

<SettingsRow
	icon={DatabaseArrowUpIcon}
	name={$LL.organization.upgrade.available()}
	meta={$LL.organization.upgrade.availableOrganization()}
	data-upgrade-mark="organization"
>
	{#snippet control()}
		<Button
			type="button"
			variant="ghost"
			size="sm"
			data-upgrade-review
			onclick={() => openUpgrade('organization')}
		>
			{$LL.organization.upgrade.review()}
		</Button>
	{/snippet}
</SettingsRow>
