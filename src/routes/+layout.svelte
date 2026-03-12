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
	import LL, { locale, setLocale } from '$lib/i18n/i18n-svelte';
	import { localesMetadata } from '$lib/i18n/i18n-translations-util';
	import type { Locales } from '$lib/i18n/i18n-types';
	import { baseLocale, locales } from '$lib/i18n/i18n-util';
	import { loadLocaleAsync } from '$lib/i18n/i18n-util.async';
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

	let isI18nReady = $state(false);
	let startupState = $state<StartupState>('loading');
	let startupError = $state<string | null>(null);
	let startupRecovery = $state<UpdateRecovery | null>(null);
	let recoveryActionError = $state<string | null>(null);
	let isRecoveryActionPending = $state(false);

	function getErrorMessage(error: unknown) {
		return error instanceof Error ? error.message : $LL.layout.startup.failedToStartFallback();
	}

	function formatTimestamp(value: number | null | undefined) {
		if (!value) {
			return $LL.common.messages.unknown();
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
			const settings = await api.settings.get();
			const locale = (settings.locale ?? baseLocale) as Locales;

			for (const locale of locales) {
				await loadLocaleAsync(locale);
			}

			setLocale(locale);

			isI18nReady = true;

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
				throw new Error($LL.layout.startup.recoverySnapshotNotUpdated());
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
		startApp();
	});

	let { children } = $props();
</script>

{#if isI18nReady}
	<QueryClientProvider client={queryClient}>
		<SonnerProvider>
			<TooltipProvider>
				<div
					lang={$locale}
					dir={localesMetadata[$locale].direction}
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
									<p class="text-sm text-muted-foreground">{$LL.common.messages.loadingApp()}</p>
								</div>
							</div>
						{:else if startupState === 'recovery' && startupRecovery}
							<div class="flex min-h-full flex-1 items-center justify-center p-1">
								<Card class="w-full max-w-2xl gap-4">
									<CardHeader>
										<CardTitle>{$LL.layout.startup.recoveryRequiredTitle()}</CardTitle>
										<CardDescription>
											{$LL.layout.startup.recoveryDescription({
												version: startupRecovery.failedVersion
											})}
										</CardDescription>
									</CardHeader>
									<CardContent class="space-y-4">
										<Callout variant="error">{startupRecovery.error}</Callout>

										<div class="grid gap-3 sm:grid-cols-2">
											<div class="rounded-lg border bg-muted/15 p-3">
												<p class="text-xs tracking-wide text-muted-foreground uppercase">
													{$LL.layout.startup.startupRecoveryBackup()}
												</p>
												<p class="mt-1 font-medium break-all">{startupRecovery.backupName}</p>
											</div>
											<div class="rounded-lg border bg-muted/15 p-3">
												<p class="text-xs tracking-wide text-muted-foreground uppercase">
													{$LL.layout.startup.previousVersion()}
												</p>
												<p class="mt-1 font-medium">
													{startupRecovery.previousVersion ?? $LL.common.messages.unknown()}
												</p>
											</div>
										</div>

										<p class="text-sm text-muted-foreground">
											{$LL.layout.startup.recoveryDetails({
												detectedAt: formatTimestamp(startupRecovery.detectedAt)
											})}
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
												{isRecoveryActionPending
													? $LL.common.actions.rollingBack()
													: $LL.common.actions.rollback()}
											</Button>
											<Button
												variant="outline"
												onclick={() => void proceedFailedUpdate()}
												disabled={isRecoveryActionPending}
											>
												{isRecoveryActionPending
													? $LL.common.actions.working()
													: $LL.common.actions.proceed()}
											</Button>
										</div>
									</CardContent>
								</Card>
							</div>
						{:else if startupState === 'rolledBackLocked' && startupRecovery}
							<div class="flex min-h-full flex-1 items-center justify-center p-1">
								<Card class="w-full max-w-2xl gap-4">
									<CardHeader>
										<CardTitle>{$LL.layout.startup.rolledBackTitle()}</CardTitle>
										<CardDescription>
											{$LL.layout.startup.rolledBackDescription()}
										</CardDescription>
									</CardHeader>
									<CardContent class="space-y-4">
										<Callout variant="warning">{startupRecovery.error}</Callout>

										<div class="grid gap-3 sm:grid-cols-2">
											<div class="rounded-lg border bg-muted/15 p-3">
												<p class="text-xs tracking-wide text-muted-foreground uppercase">
													{$LL.layout.startup.restoredBackup()}
												</p>
												<p class="mt-1 font-medium break-all">{startupRecovery.backupName}</p>
											</div>
											<div class="rounded-lg border bg-muted/15 p-3">
												<p class="text-xs tracking-wide text-muted-foreground uppercase">
													{$LL.layout.startup.previousVersion()}
												</p>
												<p class="mt-1 font-medium">
													{startupRecovery.previousVersion ?? $LL.common.messages.unknown()}
												</p>
											</div>
										</div>

										<p class="text-sm text-muted-foreground">
											{$LL.layout.startup.rolledBackDetails()}
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
												{$LL.common.actions.openPreviousRelease()}
											</Button>
										</div>
									</CardContent>
								</Card>
							</div>
						{:else if startupState === 'error'}
							<div class="flex min-h-full flex-1 items-center justify-center p-1">
								<Card class="w-full max-w-lg gap-4">
									<CardHeader>
										<CardTitle>{$LL.layout.startup.failedToStartTitle()}</CardTitle>
										<CardDescription>
											{$LL.layout.startup.failedToStartDescription()}
										</CardDescription>
									</CardHeader>
									<CardContent class="space-y-4">
										<p class="text-sm text-muted-foreground">{startupError}</p>
										<Button onclick={() => void startApp()}
											>{$LL.common.actions.retryStartup()}</Button
										>
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
{:else}
	<div class="flex h-screen items-center justify-center"></div>
{/if}
