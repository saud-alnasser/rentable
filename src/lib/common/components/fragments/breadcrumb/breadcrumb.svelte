<script lang="ts">
	import type { WithElementRef } from '$lib/common/utils/tailwind.js';
	import { LL } from '$lib/i18n/i18n-svelte';
	import type { HTMLAttributes } from 'svelte/elements';

	let {
		ref = $bindable(null),
		class: className,
		children,
		...restProps
	}: WithElementRef<HTMLAttributes<HTMLElement>> = $props();
</script>

<nav
	bind:this={ref}
	data-slot="breadcrumb"
	class={className}
	aria-label={$LL.common.ui.breadcrumb()}
	{...restProps}
>
	{@render children?.()}
</nav>
