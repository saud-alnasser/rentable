<script lang="ts">
	import api from '$lib/api/mod';
	import Navbar from '$lib/common/components/blocks/navbar.svelte';
	import WindowControls from '$lib/common/components/blocks/window-controls.svelte';
	import { Button } from '$lib/common/components/fragments/button';
	import {
		Card,
		CardContent,
		CardDescription,
		CardHeader,
		CardTitle
	} from '$lib/common/components/fragments/card';
	import { Spinner } from '$lib/common/components/fragments/spinner';
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

	type StartupState = 'loading' | 'ready' | 'error';

	let startupState = $state<StartupState>('loading');
	let startupError = $state<string | null>(null);

	function getErrorMessage(error: unknown) {
		return error instanceof Error ? error.message : 'failed to start the app.';
	}

	async function startApp() {
		startupState = 'loading';
		startupError = null;

		await api.window.show();

		try {
			await api.database.connect();
			await api.state.sync();
			startupState = 'ready';
		} catch (error) {
			startupState = 'error';
			startupError = getErrorMessage(error);
		}
	}

	onMount(() => {
		void startApp();
	});

	let { children } = $props();
</script>

<QueryClientProvider client={queryClient}>
	<SonnerProvider>
		<TooltipProvider>
			<div
				class="relative flex h-screen min-h-0 w-screen min-w-0 flex-col overflow-hidden border border-border/60 bg-background"
			>
				<header class="shrink-0">
					<WindowControls />
				</header>

				<main
					class="app-scroll @container/main flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4 pb-28"
				>
					{#if startupState === 'loading'}
						<div class="flex min-h-full flex-1 items-center justify-center p-1">
							<div class="flex flex-col items-center gap-3">
								<Spinner class="size-8 text-muted-foreground" />
								<p class="text-sm text-muted-foreground">loading app...</p>
							</div>
						</div>
					{:else if startupState === 'error'}
						<div class="flex min-h-full flex-1 items-center justify-center p-1">
							<Card class="w-full max-w-lg gap-4">
								<CardHeader>
									<CardTitle>failed to start the app</CardTitle>
									<CardDescription>
										there was a problem connecting the database or running startup sync.
									</CardDescription>
								</CardHeader>
								<CardContent class="space-y-4">
									<p class="text-sm text-muted-foreground">{startupError}</p>
									<Button onclick={() => void startApp()}>retry startup</Button>
								</CardContent>
							</Card>
						</div>
					{:else}
						{@render children?.()}
					{/if}
				</main>

				{#if startupState === 'ready'}
					<Navbar />
				{/if}
			</div>
		</TooltipProvider>
	</SonnerProvider>
</QueryClientProvider>
