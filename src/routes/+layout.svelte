<script lang="ts">
	import api from '$lib/api/mod';
	import { tauri, type Recovery } from '$lib/api/tauri';
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
				retry: false,
				refetchOnWindowFocus: false
			}
		}
	});

	type StartupState = 'loading' | 'ready' | 'error' | 'recovery';

	let isI18nReady = $state(false);
	let startupState = $state<StartupState>('loading');
	let startupError = $state<string | null>(null);
	let startupRecovery = $state<Recovery | null>(null);

	function getErrorMessage(error: unknown) {
		if (error instanceof Error && error.message.trim()) {
			return error.message;
		}

		if (typeof error === 'string' && error.trim()) {
			return error;
		}

		if (error && typeof error === 'object' && 'message' in error) {
			const message = error.message;

			if (typeof message === 'string' && message.trim()) {
				return message;
			}
		}

		return $LL.layout.startup.failedToStartFallback();
	}

	function hasRecoveryData(recovery: Recovery | null) {
		if (!recovery) {
			return false;
		}

		return (
			recovery.targetVersion.trim().length > 0 ||
			recovery.backupVersion.trim().length > 0 ||
			recovery.backupFilename.trim().length > 0 ||
			recovery.backupReleaseUrl.trim().length > 0 ||
			recovery.updateError !== null
		);
	}

	function applyRecoveryState(recovery: Recovery) {
		if (!hasRecoveryData(recovery)) {
			startupRecovery = null;
			return false;
		}

		if (recovery.status === 'pending') {
			startupRecovery = recovery;
			startupState = 'recovery';
			return true;
		}

		startupRecovery = null;

		return false;
	}

	async function startApp() {
		startupState = 'loading';
		startupError = null;
		startupRecovery = null;

		try {
			const settings = await api.app.settings.get();
			const nextLocale = (settings.locale ?? baseLocale) as Locales;

			for (const locale of locales) {
				await loadLocaleAsync(locale);
			}

			setLocale(nextLocale);

			isI18nReady = true;

			const recovery = await api.app.bootstrap();

			if (applyRecoveryState(recovery)) {
				await api.app.window.show();
				return;
			}

			await api.app.state.sync();

			startupRecovery = null;
			startupState = 'ready';
			await api.app.window.show();
		} catch (error) {
			startupRecovery = null;
			startupState = 'error';
			startupError = getErrorMessage(error);
			await api.app.window.show();
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
												version: startupRecovery.targetVersion || $LL.common.messages.unknown()
											})}
										</CardDescription>
									</CardHeader>
									<CardContent class="space-y-4">
										{#if startupRecovery.updateError}
											<Callout variant="error">{startupRecovery.updateError}</Callout>
										{/if}

										<div class="grid gap-3 sm:grid-cols-2">
											<div class="rounded-lg border bg-muted/15 p-3">
												<p class="text-xs tracking-wide text-muted-foreground uppercase">
													{$LL.layout.startup.startupRecoveryBackup()}
												</p>
												<p class="mt-1 font-medium break-all">{startupRecovery.backupFilename}</p>
											</div>
											<div class="rounded-lg border bg-muted/15 p-3">
												<p class="text-xs tracking-wide text-muted-foreground uppercase">
													{$LL.layout.startup.previousVersion()}
												</p>
												<p class="mt-1 font-medium">
													{startupRecovery.backupVersion || $LL.common.messages.unknown()}
												</p>
											</div>
										</div>

										<p class="text-sm text-muted-foreground">
											{$LL.layout.startup.recoveryDetails({
												backupVersion:
													startupRecovery.backupVersion || $LL.common.messages.unknown()
											})}
										</p>

										<div class="flex flex-wrap gap-3">
											<Button onclick={() => void startApp()}>
												{$LL.common.actions.retryStartup()}
											</Button>
											<Button
												variant="outline"
												onclick={() => {
													const backupReleaseUrl = startupRecovery?.backupReleaseUrl;

													if (backupReleaseUrl) {
														void tauri.opener.openUrl(backupReleaseUrl);
													}
												}}
												disabled={!startupRecovery.backupReleaseUrl}
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
