<script lang="ts">
	import { Toaster } from '$lib/design/primitive/sonner';
	let { children } = $props();
</script>

<Toaster duration={1500} />

{@render children?.()}
