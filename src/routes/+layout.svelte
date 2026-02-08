<script lang="ts">
	import api from '$lib/api/mod';
	import { onMount } from 'svelte';
	import '../app.css';

	onMount(() => api.window.show());

	let { children } = $props();
</script>

{@render children()}
