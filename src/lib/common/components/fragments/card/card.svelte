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
	data-slot="card"
	dir={localesMetadata[$locale].direction}
	class={cn(
		'flex flex-col gap-6 rounded-[1.5rem] border border-border/65 bg-card/72 py-6 text-start text-card-foreground shadow-lg backdrop-blur-lg',
		className
	)}
	{...restProps}
>
	{@render children?.()}
</div>
