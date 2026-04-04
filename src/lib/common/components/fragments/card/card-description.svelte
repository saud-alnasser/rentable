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
	}: WithElementRef<HTMLAttributes<HTMLParagraphElement>> = $props();
</script>

<p
	bind:this={ref}
	data-slot="card-description"
	dir={localesMetadata[$locale].direction}
	class={cn('text-start text-sm text-muted-foreground', className)}
	{...restProps}
>
	{@render children?.()}
</p>
