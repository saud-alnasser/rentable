<script lang="ts">
	import { invoke } from '@tauri-apps/api/core';
	import { onMount } from 'svelte';
	import '../app.css';

	onMount(() => invoke('show_window'));

	let { children } = $props();
</script>

{@render children()}
