<script lang="ts">
	import api from '$lib/api/mod';
	import Navbar from '$lib/common/components/blocks/navbar.svelte';
	import WindowControls from '$lib/common/components/blocks/window-controls.svelte';
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

	onMount(() => {
		void api.database.connect().then(async () => {
			try {
				await api.state.sync();
			} finally {
				await api.window.show();
			}
		});
	});

	let { children } = $props();
</script>

<QueryClientProvider client={queryClient}>
	<SonnerProvider>
		<TooltipProvider>
			<div
				class="relative flex h-screen min-h-0 w-screen min-w-0 flex-col overflow-hidden border border-border/60 bg-background/95"
			>
				<header class="shrink-0">
					<WindowControls />
				</header>

				<main
					class="app-scroll @container/main flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4 pb-28"
				>
					{@render children?.()}
				</main>

				<Navbar />
			</div>
		</TooltipProvider>
	</SonnerProvider>
</QueryClientProvider>
