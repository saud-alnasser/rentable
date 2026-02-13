<script lang="ts">
	import api from '$lib/api/mod';
	import SidebarBreadcrumb from '$lib/common/components/blocks/sidebar-breadcrumb.svelte';
	import SidebarLinks from '$lib/common/components/blocks/sidebar-links.svelte';
	import { SidebarInset, SidebarProvider } from '$lib/common/components/fragments/sidebar';
	import SonnerProvider from '$lib/common/components/providers/sonner-provider.svelte';
	import { QueryClient, QueryClientProvider } from '@tanstack/svelte-query';
	import { onMount } from 'svelte';
	import '../app.css';

	const queryClient = new QueryClient({
		defaultOptions: {
			queries: {
				refetchOnWindowFocus: false
			}
		}
	});

	onMount(() => api.database.connect().then(() => api.window.show()));

	let { children } = $props();
</script>

<QueryClientProvider client={queryClient}>
	<SonnerProvider>
		<SidebarProvider class="flex h-screen overflow-hidden">
			<SidebarLinks />
			<SidebarInset class="flex flex-1 flex-col overflow-hidden">
				<SidebarBreadcrumb />
				<main class="app-scroll @container/main flex flex-1 flex-col gap-3 overflow-y-auto p-4">
					{@render children?.()}
				</main>
			</SidebarInset>
		</SidebarProvider>
	</SonnerProvider>
</QueryClientProvider>
