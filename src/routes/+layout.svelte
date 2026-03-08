<script lang="ts">
	import api from '$lib/api/mod';
	import Navbar from '$lib/common/components/blocks/navbar.svelte';
	import { TooltipProvider } from '$lib/common/components/fragments/tooltip';
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
		<TooltipProvider>
			<div class="relative flex h-screen flex-col overflow-hidden bg-background">
				<header>
					<Navbar />
				</header>

				<main
					class="app-scroll @container/main flex flex-1 flex-col gap-3 overflow-y-auto p-4 pb-28"
				>
					{@render children?.()}
				</main>
			</div>
		</TooltipProvider>
	</SonnerProvider>
</QueryClientProvider>
