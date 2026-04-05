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
		'flex flex-col gap-6 rounded-[1.5rem] border border-border/70 bg-card/65 py-6 text-start text-card-foreground [box-shadow:inset_0_1px_0_rgb(255_255_255_/_0.06),0_20px_48px_rgb(15_23_42_/_0.18)] backdrop-blur-xl dark:[box-shadow:inset_0_1px_0_rgb(255_255_255_/_0.05),0_20px_48px_rgb(2_6_23_/_0.38)]',
		className
	)}
	{...restProps}
>
	{@render children?.()}
</div>
