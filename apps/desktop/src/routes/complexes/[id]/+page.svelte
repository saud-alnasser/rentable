<script lang="ts">
	import { page } from '$app/state';
	import ComplexDetails from '$lib/complex/component/details.svelte';

	const complexId = $derived(page.params.id ?? '');
</script>

<!-- keyed on the record, so moving from one record to another of this kind (a renewal, the
     palette, a link, the back button) shows the second from its own start rather than keeping the
     first on screen. -->
{#key complexId}
	<ComplexDetails {complexId} />
{/key}
