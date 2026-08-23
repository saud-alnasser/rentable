<script lang="ts">
	import { cn, type WithElementRef } from '@rentable/design/tailwind.js';
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
		'flex flex-col gap-5 rounded-3xl bg-card py-5 text-start text-sm text-card-foreground shadow-sm ring-1 ring-foreground/10',
		className
	)}
	{...restProps}
>
	{@render children?.()}
</div>
