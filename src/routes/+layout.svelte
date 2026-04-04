<script lang="ts">
	import api from '$lib/api/mod';
	import type { Recovery } from '$lib/api/tauri';
	import { TooltipProvider } from '$lib/common/components/fragments/tooltip';
	import SonnerProvider from '$lib/common/components/providers/sonner-provider.svelte';
	import LL, { locale, setLocale } from '$lib/i18n/i18n-svelte';
	import { localesMetadata } from '$lib/i18n/i18n-translations-util';
	import type { Locales } from '$lib/i18n/i18n-types';
	import { baseLocale, locales } from '$lib/i18n/i18n-util';
	import { loadLocaleAsync } from '$lib/i18n/i18n-util.async';
	import LayoutFrame from '$lib/resources/layout/components/layout-frame.svelte';
	import LayoutStartupError from '$lib/resources/layout/components/layout-startup-error.svelte';
	import LayoutStartupLoading from '$lib/resources/layout/components/layout-startup-loading.svelte';
	import LayoutStartupRecovery from '$lib/resources/layout/components/layout-startup-recovery.svelte';
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
	let currentDirection = $derived(localesMetadata[$locale].direction);

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

	$effect(() => {
		if (!isI18nReady || typeof document === 'undefined') {
			return;
		}

		document.documentElement.lang = $locale;
		document.documentElement.dir = currentDirection;
		document.body.setAttribute('lang', $locale);
		document.body.dir = currentDirection;
	});

	let { children } = $props();
</script>

{#if isI18nReady}
	<QueryClientProvider client={queryClient}>
		<SonnerProvider>
			<TooltipProvider>
				<LayoutFrame {currentDirection} showNavbar={startupState === 'ready'}>
					{#if startupState === 'loading'}
						<LayoutStartupLoading />
					{:else if startupState === 'recovery' && startupRecovery}
						<LayoutStartupRecovery recovery={startupRecovery} onRetry={() => void startApp()} />
					{:else if startupState === 'error'}
						<LayoutStartupError message={startupError} onRetry={() => void startApp()} />
					{:else}
						{@render children?.()}
					{/if}
				</LayoutFrame>
			</TooltipProvider>
		</SonnerProvider>
	</QueryClientProvider>
{:else}
	<div class="flex h-screen items-center justify-center"></div>
{/if}
