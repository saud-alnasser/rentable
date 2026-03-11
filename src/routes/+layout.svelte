<script lang="ts">
	import api from '$lib/api/mod';
	import { tauri, type UpdateRecovery } from '$lib/api/tauri';
	import Navbar from '$lib/common/components/blocks/navbar.svelte';
	import WindowControls from '$lib/common/components/blocks/window-controls.svelte';
	import { Button } from '$lib/common/components/fragments/button';
	import { Callout } from '$lib/common/components/fragments/callout';
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

	type StartupState = 'loading' | 'ready' | 'error' | 'recovery' | 'rolledBackLocked';

	let startupState = $state<StartupState>('loading');
	let startupError = $state<string | null>(null);
	let startupRecovery = $state<UpdateRecovery | null>(null);
	let recoveryActionError = $state<string | null>(null);
	let isRecoveryActionPending = $state(false);

	function getErrorMessage(error: unknown) {
		return error instanceof Error ? error.message : 'failed to start the app.';
	}

	function formatTimestamp(value: number | null | undefined) {
		if (!value) {
			return 'unknown';
		}

		return new Intl.DateTimeFormat('en-GB', {
			dateStyle: 'medium',
			timeStyle: 'short'
		}).format(new Date(value));
	}

	function applyRecoveryState(recovery: UpdateRecovery | null) {
		startupRecovery = recovery;

		if (!recovery) {
			return false;
		}

		startupState = recovery.status === 'rolledBack' ? 'rolledBackLocked' : 'recovery';

		return true;
	}

	async function getStartupRecovery() {
		const settings = await api.settings.get();

		return settings.updateRecovery;
	}

	async function tryGetStartupRecovery() {
		try {
			return await getStartupRecovery();
		} catch {
			return null;
		}
	}

	async function startApp() {
		startupState = 'loading';
		startupError = null;
		startupRecovery = null;
		recoveryActionError = null;

		try {
			await api.window.show();

			if (applyRecoveryState(await getStartupRecovery())) {
				return;
			}

			await api.database.connect();
			await api.state.sync();

			if (applyRecoveryState(await getStartupRecovery())) {
				return;
			}

			startupRecovery = null;
			startupState = 'ready';
		} catch (error) {
			if (applyRecoveryState(await tryGetStartupRecovery())) {
				return;
			}

			startupRecovery = null;
			startupState = 'error';
			startupError = getErrorMessage(error);
		}
	}

	async function proceedFailedUpdate() {
		if (!startupRecovery || isRecoveryActionPending) {
			return;
		}

		isRecoveryActionPending = true;
		recoveryActionError = null;

		try {
			await api.settings.proceedFailedUpdate();
			startupRecovery = null;
			await startApp();
		} catch (error) {
			recoveryActionError = getErrorMessage(error);
		} finally {
			isRecoveryActionPending = false;
		}
	}

	async function rollbackFailedUpdate() {
		if (!startupRecovery || isRecoveryActionPending) {
			return;
		}

		isRecoveryActionPending = true;
		recoveryActionError = null;

		try {
			const settings = await api.settings.rollbackFailedUpdate();
			const recovery = settings.updateRecovery;

			if (!recovery || recovery.status !== 'rolledBack') {
				throw new Error('rollback completed but the recovery snapshot was not updated.');
			}

			startupRecovery = recovery;
			startupState = 'rolledBackLocked';
		} catch (error) {
			recoveryActionError = getErrorMessage(error);
		} finally {
			isRecoveryActionPending = false;
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
					{:else if startupState === 'recovery' && startupRecovery}
						<div class="flex min-h-full flex-1 items-center justify-center p-1">
							<Card class="w-full max-w-2xl gap-4">
								<CardHeader>
									<CardTitle>update recovery required</CardTitle>
									<CardDescription>
										rentable failed to finish starting after updating to v{startupRecovery.failedVersion}.
										choose whether to restore the protected pre-update backup or retry startup.
									</CardDescription>
								</CardHeader>
								<CardContent class="space-y-4">
									<Callout variant="error">{startupRecovery.error}</Callout>

									<div class="grid gap-3 sm:grid-cols-2">
										<div class="rounded-lg border bg-muted/15 p-3">
											<p class="text-xs tracking-wide text-muted-foreground uppercase">backup</p>
											<p class="mt-1 font-medium break-all">{startupRecovery.backupName}</p>
										</div>
										<div class="rounded-lg border bg-muted/15 p-3">
											<p class="text-xs tracking-wide text-muted-foreground uppercase">
												previous version
											</p>
											<p class="mt-1 font-medium">
												{startupRecovery.previousVersion ?? 'unknown'}
											</p>
										</div>
									</div>

									<p class="text-sm text-muted-foreground">
										detected {formatTimestamp(startupRecovery.detectedAt)}. rollback restores the
										protected database backup and locks the app so you can reinstall the previous
										release. proceed clears recovery and retries startup with the current version.
									</p>

									{#if recoveryActionError}
										<Callout variant="warning">{recoveryActionError}</Callout>
									{/if}

									<div class="flex flex-wrap gap-3">
										<Button
											variant="destructive"
											onclick={() => void rollbackFailedUpdate()}
											disabled={isRecoveryActionPending}
										>
											{isRecoveryActionPending ? 'rolling back...' : 'rollback'}
										</Button>
										<Button
											variant="outline"
											onclick={() => void proceedFailedUpdate()}
											disabled={isRecoveryActionPending}
										>
											{isRecoveryActionPending ? 'working...' : 'proceed'}
										</Button>
									</div>
								</CardContent>
							</Card>
						</div>
					{:else if startupState === 'rolledBackLocked' && startupRecovery}
						<div class="flex min-h-full flex-1 items-center justify-center p-1">
							<Card class="w-full max-w-2xl gap-4">
								<CardHeader>
									<CardTitle>update rolled back</CardTitle>
									<CardDescription>
										the protected database backup has been restored and the app is locked until you
										reinstall the previous release.
									</CardDescription>
								</CardHeader>
								<CardContent class="space-y-4">
									<Callout variant="warning">{startupRecovery.error}</Callout>

									<div class="grid gap-3 sm:grid-cols-2">
										<div class="rounded-lg border bg-muted/15 p-3">
											<p class="text-xs tracking-wide text-muted-foreground uppercase">
												restored backup
											</p>
											<p class="mt-1 font-medium break-all">{startupRecovery.backupName}</p>
										</div>
										<div class="rounded-lg border bg-muted/15 p-3">
											<p class="text-xs tracking-wide text-muted-foreground uppercase">
												previous version
											</p>
											<p class="mt-1 font-medium">
												{startupRecovery.previousVersion ?? 'unknown'}
											</p>
										</div>
									</div>

									<p class="text-sm text-muted-foreground">
										open the previous GitHub release, reinstall it, then launch rentable again.
									</p>

									{#if recoveryActionError}
										<Callout variant="warning">{recoveryActionError}</Callout>
									{/if}

									<div class="flex flex-wrap gap-3">
										<Button
											variant="outline"
											onclick={() => {
												const previousReleaseUrl = startupRecovery?.previousReleaseUrl;

												if (previousReleaseUrl) {
													void tauri.opener.openUrl(previousReleaseUrl);
												}
											}}
											disabled={!startupRecovery?.previousReleaseUrl}
										>
											open previous release
										</Button>
									</div>
								</CardContent>
							</Card>
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
