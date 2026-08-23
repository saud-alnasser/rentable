<script lang="ts">
	import { useDesignContract } from '#lib/strings.js';
	import type { WithElementRef } from '#lib/tailwind.js';
	import type { HTMLAttributes } from 'svelte/elements';

	let {
		ref = $bindable(null),
		class: className,
		children,
		...restProps
	}: WithElementRef<HTMLAttributes<HTMLElement>> = $props();

	const contract = useDesignContract();
</script>

<nav
	bind:this={ref}
	data-slot="breadcrumb"
	class={className}
	aria-label={contract.strings.breadcrumb}
	{...restProps}
>
	{@render children?.()}
</nav>
