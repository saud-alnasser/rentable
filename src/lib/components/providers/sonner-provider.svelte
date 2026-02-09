<script lang="ts">
	import { Toaster } from '$lib/components/fragments/sonner';
	let { children } = $props();
</script>

<Toaster />

{@render children?.()}
