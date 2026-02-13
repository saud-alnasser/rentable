<script lang="ts">
	import { Checkbox } from '$lib/common/components/fragments/checkbox';
	import type { ComponentProps } from 'svelte';

	let {
		checked = false,
		onCheckedChange = (v) => (checked = v),
		...restProps
	}: ComponentProps<typeof Checkbox> = $props();
</script>

<div class="flex items-center justify-center">
	<Checkbox bind:checked={() => checked, onCheckedChange} {...restProps} />
</div>
