<script lang="ts">
	import { LL, locale } from '$lib/i18n/i18n-svelte';
	import { localesMetadata } from '$lib/platform/locale';
	import WayInPreferences from '$lib/settings/component/way-in-preferences.svelte';
	import WayInSurface from '@rentable/design/block/way-in-surface.svelte';

	/**
	 * A step of the way in with the preferences control at its foot, in the reading direction of
	 * the language chosen, as the window draws one. Scaffolding for
	 * `way-in-preferences.svelte.test.ts`.
	 */
</script>

<div dir={localesMetadata[$locale].direction} data-harness-root>
	<WayInSurface step="one" title={$LL.settings.title()}>
		{#snippet foot()}
			<WayInPreferences />
		{/snippet}
	</WayInSurface>
</div>
