<script lang="ts">
	import api from '$lib/api/mod';
	import SidebarBreadcrumb from '$lib/components/design/sidebar-breadcrumb.svelte';
	import SidebarLinks from '$lib/components/design/sidebar-links.svelte';
	import { SidebarInset, SidebarProvider } from '$lib/components/fragments/sidebar';
	import SonnerProvider from '$lib/components/providers/sonner-provider.svelte';
	import { onMount } from 'svelte';
	import '../app.css';

	onMount(() => api.window.show());

	let { children } = $props();
</script>

<SonnerProvider>
	<SidebarProvider>
		<SidebarLinks />
		<SidebarInset>
			<SidebarBreadcrumb />
			<div class="flex flex-1 flex-col">
				<main class="@container/main flex flex-1 flex-col gap-3">
					{@render children?.()}
				</main>
			</div>
		</SidebarInset>
	</SidebarProvider>
</SonnerProvider>
