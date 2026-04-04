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
	data-slot="card-title"
	dir={localesMetadata[$locale].direction}
	class={cn('text-start leading-none font-semibold', className)}
	{...restProps}
>
	{@render children?.()}
</div>
