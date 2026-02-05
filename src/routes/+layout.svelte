<script lang="ts">
	import { app } from '$lib/app';
	import { onMount } from 'svelte';
	import '../app.css';

	onMount(() => app.window.show());

	let { children } = $props();
</script>

{@render children()}
