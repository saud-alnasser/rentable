<script lang="ts">
	import { Toaster } from '$lib/common/components/fragments/sonner';
	let { children } = $props();
</script>

<Toaster />

{@render children?.()}
