<script lang="ts">
	import { cn, type WithElementRef } from '$lib/common/utils/tailwind.js';
	import { locale } from '$lib/i18n/i18n-svelte';
	import { localesMetadata } from '$lib/i18n/i18n-translations-util';
	import type { HTMLAttributes } from 'svelte/elements';

	let {
		ref = $bindable(null),
		class: className,
		children,
		...restProps
	}: WithElementRef<HTMLAttributes<HTMLDivElement>> = $props();
</script>

<div
	bind:this={ref}
	data-slot="card-header"
	dir={localesMetadata[$locale].direction}
	class={cn(
		'@container/card-header grid auto-rows-min grid-rows-[auto_auto] items-start gap-1.5 px-6 text-start has-data-[slot=card-action]:grid-cols-[1fr_auto] [.border-b]:pb-6',
		className
	)}
	{...restProps}
>
	{@render children?.()}
</div>

<style>
	:global([dir='rtl'] [data-slot='card-header']:has([data-slot='card-action'])) {
		grid-template-columns: auto minmax(0, 1fr);
	}
</style>
