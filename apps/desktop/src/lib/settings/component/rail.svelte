<script lang="ts">
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { LL } from '$lib/i18n/i18n-svelte';
	import {
		sectionOf,
		shownSection,
		withSection,
		type SettingsSection
	} from '$lib/settings/section';

	/**
	 * The settings area's section control: tabs above the body.
	 *
	 * **A `nav` of anchors, not the `Tabs` primitive**, and the two halves of that were settled
	 * separately. The mechanism is anchors because every section is addressable: a menu row, the
	 * command palette and a bookmark all open one by its address, which a tab panel switched in
	 * place cannot be. The look is tabs because the owner chose it on screen, against the four
	 * bars of the prototype at
	 * [[efforts/826-the-organization-and-the-way-in-are-rethought/evidence/prototypes/the-settings-area-on-screen]]:
	 * the vertical column the plan had argued for read as a second sidebar beside the real one,
	 * and the column with no ground went with it.
	 *
	 * **The current section is read from the address, never from `isActiveRoute`.** Every section
	 * shares one pathname, so the route helper marks all seven or none; what tells them apart is
	 * `?section=`, which is what `sectionOf` reads.
	 */
	let {
		sections
	}: {
		/** the sections this reader is offered, in order, as `sectionsFor` answers. */
		sections: SettingsSection[];
	} = $props();

	// an address naming a section this reader is not offered draws the default section, so the
	// mark follows the body rather than pointing at a tab that is not here.
	const current = $derived(shownSection(sectionOf(page.url), sections));
</script>

<!-- the rule belongs to the row rather than to each tab, and the underline of the current one
     sits over it: the hairline pull-up is the overlap, not spacing. -->
<nav
	aria-label={$LL.settings.title()}
	data-settings-rail
	class="flex gap-6 overflow-x-auto border-b"
>
	{#each sections as section (section)}
		<a
			href={resolve(withSection(section))}
			aria-current={section === current ? 'page' : undefined}
			data-settings-section={section}
			class="-mb-px shrink-0 border-b-2 border-transparent pb-3 text-sm font-medium whitespace-nowrap text-muted-foreground capitalize transition-colors hover:text-foreground aria-[current=page]:border-primary aria-[current=page]:text-foreground"
		>
			{$LL.settings.section[section]()}
		</a>
	{/each}
</nav>
