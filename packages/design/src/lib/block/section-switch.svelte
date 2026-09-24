<script lang="ts" module>
	/** One section a reader can switch to, at its own address. */
	export type SwitchSection = {
		/** What names the section in the address: the value `?section=` carries. */
		value: string;
		/** What the section is called, in the reader's language. */
		label: string;
		/** The section's address, already resolved. */
		href: string;
	};
</script>

<script lang="ts">
	/**
	 * The one control a surface's sections are switched with: a record's collections, and the
	 * settings area's sections.
	 *
	 * **A row of links, not a tab panel switched in place.** Every section has an address, so a
	 * menu row, the command palette, a link somebody was sent and the trail back all open a
	 * section by where it is, and the surface draws whichever section the address names. The
	 * control therefore holds no state of its own: it is told which section is current, and a
	 * press is an ordinary navigation to another address on the same page.
	 *
	 * **The look is the settings area's tabs**, which the owner chose on screen against the column
	 * the plan argued for: an underline under the current one, over a hairline the row shares.
	 * The record surface's filled tab list went with it, so a reader who has switched sections in
	 * one place recognises the control in the other.
	 *
	 * A switch replaces the address rather than adding to it, keeps the scroll and keeps focus on
	 * the link pressed: moving between the sections of one page is not leaving it, which is also
	 * why the back trail keys on the pathname alone.
	 */
	let {
		sections,
		current,
		label
	}: {
		/** The sections offered, in the order they are drawn. */
		sections: SwitchSection[];
		/** The value of the section on screen. */
		current: string;
		/** What names the row for a screen reader: the page whose sections these are. */
		label: string;
	} = $props();
</script>

<!-- the rule belongs to the row rather than to each link, and the underline of the current one
     sits over it: the hairline pull-up is the overlap, not spacing. -->
<nav aria-label={label} data-section-switch class="flex shrink-0 gap-6 overflow-x-auto border-b">
	{#each sections as section (section.value)}
		<!-- the address is the caller's, already resolved: resolving it again here would put the
		     base on twice. -->
		<a
			href={section.href}
			aria-current={section.value === current ? 'page' : undefined}
			data-section={section.value}
			data-sveltekit-replacestate
			data-sveltekit-noscroll
			data-sveltekit-keepfocus
			class="-mb-px shrink-0 border-b-2 border-transparent pb-3 text-sm font-medium whitespace-nowrap text-muted-foreground capitalize transition-colors hover:text-foreground aria-[current=page]:border-primary aria-[current=page]:text-foreground"
		>
			{section.label}
		</a>
	{/each}
</nav>
