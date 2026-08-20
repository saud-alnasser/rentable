<script lang="ts">
	import { page } from '$app/state';
	import { tauri } from '$lib/platform/tauri';
	import { Button } from '$lib/design/primitive/button';
	import { Kbd } from '$lib/design/primitive/kbd';
	import { Separator } from '$lib/design/primitive/separator';
	import * as Sidebar from '$lib/design/primitive/sidebar';
	import { LL, locale } from '$lib/i18n/i18n-svelte';
	import LayoutBreadcrumb from '$lib/layout/component/breadcrumb.svelte';
	import LayoutCaughtError from '$lib/layout/component/caught-error.svelte';
	import LayoutPalette, { PALETTE_SHORTCUT_HINT } from '$lib/layout/component/palette.svelte';
	import LayoutRecordVerbs from '$lib/layout/component/record-verbs.svelte';
	import LayoutShortcutListener from '$lib/layout/component/shortcut-listener.svelte';
	import LayoutShortcutSheet from '$lib/layout/component/shortcut-sheet.svelte';
	import LayoutSidebar from '$lib/layout/component/sidebar.svelte';
	import LayoutUndoShortcut from '$lib/layout/component/undo-shortcut.svelte';
	import LayoutWindowControls from '$lib/layout/component/window-controls.svelte';
	import { CAUGHT_ERROR_EVENT, toCaughtErrorFields } from '$lib/layout/boundary';
	import { toBreadcrumbTrail } from '$lib/layout/navigation';
	import { recordDiagnosticError } from '$lib/platform/diagnostics';
	import KeyboardIcon from '@tabler/icons-svelte/icons/keyboard';
	import SearchIcon from '@tabler/icons-svelte/icons/search';
	import type { Snippet } from 'svelte';

	/**
	 * The window, and how much of the application is in it.
	 *
	 * **Three states, and only one of them has no rail.** *Settled 2026-08-20 by looking at four
	 * alternatives.* An application that is loading, that failed to start, or that needs an update
	 * finished is not running, and chrome around those screens is chrome belonging to an
	 * application that is not there: they get the bare frame. An application waiting for a person
	 * to sign in **is** running, so it gets the rail — the same rail, with its contents saying what
	 * is true of a machine nobody has signed in on.
	 */
	let {
		currentDirection,
		shell,
		onSignIn = () => {},
		children
	}: {
		currentDirection: 'ltr' | 'rtl' | 'auto';
		/**
		 * how much of the shell this state draws.
		 *
		 * `bare` is the titlebar and nothing else, for the states where the application is not
		 * running. `signed-out` and `full` are the same rail with different contents.
		 */
		shell: 'bare' | 'signed-out' | 'full';
		/** the way in, offered by the rail's account row. Only read while `signed-out`. */
		onSignIn?: () => void;
		children: Snippet;
	} = $props();

	const hasRail = $derived(shell !== 'bare');
	const isSignedOut = $derived(shell === 'signed-out');

	const hasBreadcrumb = $derived(toBreadcrumbTrail(page.url.pathname).length > 0);

	let isPaletteOpen = $state(false);
	let isShortcutSheetOpen = $state(false);

	/**
	 * what the search and the shortcut sheet do before anybody has signed in, which is nothing.
	 *
	 * Present and refusing rather than absent, for the reason the destinations are: chrome that
	 * appears on signing in makes signing in look like arriving somewhere else. *This is a reading
	 * of "other things are disabled" rather than a decision stated in those words, and it is the
	 * cheapest thing on this screen to change.*
	 */
	const unavailable = 'pointer-events-none opacity-50';

	function startDragging(event: MouseEvent) {
		if (event.button !== 0) {
			return;
		}

		void tauri.window.drag();
	}
</script>

{#snippet content()}
	<!--
		The inner of the application's two boundaries, and the line this component is: everything
		below it is what a route drew, and everything above it is the chrome.

		A boundary renders its fallback in place of the subtree that threw, so this one cannot
		catch the chrome around it: if the rail or the titlebar throws, drawing a card inside them
		throws again. That case is caught outside this component, and it is the only state in a
		running application with no frame at all. Here, the frame stands and one screen inside it
		is replaced, which is what makes *without quitting* true.

		It covers the startup screens as well as the routed ones, because they are this component's
		children too and neither is chrome.

		**What a boundary catches is drawing**, which is rendering and the effects that follow it.
		A promise that rejects later is not drawing and never reaches here; that is what the error
		toasts and the diagnostics sink are already for. This exists for the failure that used to
		take the window with it, not for every failure.
	-->
	<svelte:boundary
		onerror={(error) =>
			recordDiagnosticError(CAUGHT_ERROR_EVENT, toCaughtErrorFields('content', error))}
	>
		{@render children?.()}

		{#snippet failed(error, reset)}
			<!-- whether there is somewhere to go rather than only something to draw again, and the
			     rail is what that means: the states drawn on the bare frame have no navigation, so
			     offering to leave for the dashboard from one of them would be offering a way out
			     that is not there. -->
			<LayoutCaughtError {error} onRetry={reset} hasWorkingShell={hasRail} />
		{/snippet}
	</svelte:boundary>
{/snippet}

{#snippet titlebar()}
	<header class="relative flex h-12 shrink-0 items-center gap-2 border-b px-2 select-none">
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div
			onmousedown={startDragging}
			ondblclick={() => void tauri.window.maximize()}
			class="absolute inset-0 cursor-grab [-webkit-app-region:drag] active:cursor-grabbing"
		></div>

		{#if hasRail}
			<div class="relative flex min-w-0 items-center gap-2 [-webkit-app-region:no-drag]">
				<!-- live in both states, and the only chrome control that is: folding is a preference
				     about the window rather than something an account grants. -->
				<Sidebar.Trigger />
				{#if hasBreadcrumb}
					<Separator orientation="vertical" class="data-[orientation=vertical]:h-4" />
					<LayoutBreadcrumb />
				{/if}
				<Button
					variant="outline"
					size="sm"
					aria-label={$LL.common.ui.commandPalette()}
					aria-disabled={isSignedOut || undefined}
					onclick={() => !isSignedOut && (isPaletteOpen = true)}
					class="ms-2 gap-2 text-muted-foreground {isSignedOut ? unavailable : ''}"
				>
					<SearchIcon />
					<span class="capitalize">{$LL.common.ui.search()}</span>
					<!-- a key name is not prose: it is what is printed on the keyboard, and the
					     keyboard does not change with the locale. -->
					<Kbd dir="ltr">{PALETTE_SHORTCUT_HINT}</Kbd>
				</Button>

				<!-- the only way into the sheet, and deliberately not a shortcut of its own: a
				     reader who does not know the application answers keys cannot press one. -->
				<Button
					variant="ghost"
					size="icon"
					aria-label={$LL.common.ui.keyboardShortcuts()}
					aria-disabled={isSignedOut || undefined}
					onclick={() => !isSignedOut && (isShortcutSheetOpen = true)}
					class="text-muted-foreground {isSignedOut ? unavailable : ''}"
				>
					<KeyboardIcon />
				</Button>
			</div>
		{/if}

		<div class="relative ms-auto">
			<LayoutWindowControls />
		</div>
	</header>
{/snippet}

<!-- the application's one keyboard listener, and outside the navigation with the undo pair it
     answers: a change made on a screen that carries no navigation is still a change the reader
     can take back. -->
<LayoutShortcutListener />
<LayoutUndoShortcut />

<div lang={$locale} dir={currentDirection} class="h-screen w-screen overflow-hidden border">
	{#if hasRail}
		{#if !isSignedOut}
			<LayoutPalette bind:open={isPaletteOpen} />
			<!-- beside the palette, because the palette is the only thing that runs these and what
			     they open has to survive it closing. -->
			<LayoutRecordVerbs />
			<LayoutShortcutSheet bind:open={isShortcutSheetOpen} />
		{/if}
		<Sidebar.Provider class="h-full min-h-0 overflow-hidden">
			<LayoutSidebar signedOut={isSignedOut} {onSignIn} />
			<Sidebar.Inset>
				{@render titlebar()}
				<div class="@container/main flex min-h-0 flex-1 flex-col overflow-y-auto">
					{@render content()}
				</div>
			</Sidebar.Inset>
		</Sidebar.Provider>
	{:else}
		<div class="flex h-full min-h-0 flex-col bg-background">
			{@render titlebar()}
			<main class="flex min-h-0 flex-1 flex-col overflow-y-auto px-4 pb-6 sm:px-6">
				{@render content()}
			</main>
		</div>
	{/if}
</div>
