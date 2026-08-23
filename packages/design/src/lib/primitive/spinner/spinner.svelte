<script lang="ts">
	import { useDesignContract } from '#lib/strings.js';
	import { cn } from '#lib/tailwind.js';
	import Loader2Icon from '@lucide/svelte/icons/loader-2';
	import type { ComponentProps } from 'svelte';

	let { class: className, ...restProps }: ComponentProps<typeof Loader2Icon> = $props();

	const contract = useDesignContract();
</script>

<Loader2Icon
	role="status"
	aria-label={contract.strings.loading}
	class={cn('size-4 animate-spin', className)}
	{...restProps}
/>
