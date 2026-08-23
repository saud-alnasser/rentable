<script lang="ts">
	import { Toaster } from '@rentable/design/primitive/sonner/index.js';
	let { children } = $props();
</script>

<Toaster duration={1500} />

{@render children?.()}
