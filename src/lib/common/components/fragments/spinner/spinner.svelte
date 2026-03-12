<script lang="ts">
	import { cn } from '$lib/common/utils/tailwind.js';
	import { LL } from '$lib/i18n/i18n-svelte';
	import Loader2Icon from '@lucide/svelte/icons/loader-2';
	import type { ComponentProps } from 'svelte';

	let { class: className, ...restProps }: ComponentProps<typeof Loader2Icon> = $props();
</script>

<Loader2Icon
	role="status"
	aria-label={$LL.common.ui.loading()}
	class={cn('size-4 animate-spin', className)}
	{...restProps}
/>
