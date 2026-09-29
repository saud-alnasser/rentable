<script lang="ts">
	import { slotsAt } from '$lib/app/surfaces';
	import { toRefusalText } from '$lib/error/refusal';
	import { LL, locale } from '$lib/i18n/i18n-svelte';
	import { NotificationProvider } from '$lib/notification/ui';
	import { recordDiagnosticError } from '$lib/platform/diagnostics';
	import { CAUGHT_ERROR_EVENT, toCaughtErrorFields } from '$lib/shell/boundary';
	import ShellCaughtError from '$lib/shell/component/caught-error.svelte';
	import ShellFrame from '$lib/shell/component/frame.svelte';
	import { TooltipProvider } from '@rentable/design/primitive/tooltip/index.js';
	import {
		DesignProvider,
		type DesignDirection,
		type DesignStrings
	} from '@rentable/design/strings.js';
	import { QueryClientProvider, type QueryClient } from '@tanstack/svelte-query';
	import type { ComponentProps, Snippet } from 'svelte';

	/**
	 * The window once a locale exists: the words the design package draws with, the outer
	 * boundary, the providers, the frame, and what the features draw beside it.
	 *
	 * Startup's root decides what goes inside and how much of the frame each of its states draws,
	 * and the root layout hands it this to draw them in (`$lib/startup/component/root.svelte`).
	 * Everything here is the shell's, so it reads no feature: the dialogs beside the frame are the
	 * `dialogs` place's slots, read off `app/surfaces`. *This was the root layout itself until
	 * effort 840's ticket 34.*
	 */
	let {
		queryClient,
		currentDirection,
		shell,
		onWayIn,
		onSwitchWorkspace,
		dialogs,
		children
	}: {
		/** the client startup reads and writes through, provided to everything drawn inside. */
		queryClient: QueryClient;
		currentDirection: DesignDirection;
		/** how much of the frame this state draws. */
		shell: ComponentProps<typeof ShellFrame>['shell'];
		onWayIn: () => void;
		onSwitchWorkspace: (workspaceId: string) => void;
		/** whether the dialogs beside the frame are drawn: the rail is up and a session is held. */
		dialogs: boolean;
		/** what goes inside the frame. */
		children: Snippet;
	} = $props();

	/**
	 * The words `@rentable/design` renders its own chrome with, which this application owns and
	 * the package only asks for.
	 *
	 * **One object rather than seventeen props**, because every one of these is the same wherever
	 * it appears: a close control says the same word in every dialog, and a spinner says the same
	 * word wherever it spins. `@rentable/design/strings.js` carries that argument in full, along
	 * with what each key labels.
	 *
	 * **Two of them are read from `common.table` rather than `common.ui`**, which is where this
	 * application had already written the pagination labels. The contract is one flat set of the
	 * keys the package actually renders, so it does not carry either namespace's shape.
	 *
	 * `$derived` rather than a constant, because a reader can change language without restarting
	 * and every packaged component has to move with them.
	 */
	const designStrings: DesignStrings = $derived({
		breadcrumb: $LL.common.ui.breadcrumb(),
		cancel: $LL.common.actions.cancel(),
		close: $LL.common.ui.close(),
		commandPalette: $LL.common.ui.commandPalette(),
		commandPaletteDescription: $LL.common.ui.commandPaletteDescription(),
		delete: $LL.common.actions.delete(),
		deleteBlockedDescription: $LL.common.deleteDialog.blockedDescription(),
		deleteDescription: $LL.common.deleteDialog.description(),
		deleting: $LL.common.actions.deleting(),
		goBack: $LL.common.actions.goBack(),
		export: $LL.common.actions.export(),
		exportDescription: $LL.common.export.description(),
		formatCsv: $LL.common.formats.csv(),
		formatXlsx: $LL.common.formats.xlsx(),
		goToNextPage: $LL.common.table.goToNextPage(),
		goToPreviousPage: $LL.common.table.goToPreviousPage(),
		loading: $LL.common.ui.loading(),
		loadingRecord: $LL.common.messages.loadingRecord(),
		mobileSidebarDescription: $LL.common.ui.mobileSidebarDescription(),
		more: $LL.common.ui.more(),
		morePages: $LL.common.ui.morePages(),
		moreRecords: (count: number) => $LL.common.selection.more({ count }),
		next: $LL.common.ui.next(),
		nextSlide: $LL.common.ui.nextSlide(),
		nothingToDo: $LL.common.selection.nothingToDo(),
		openMenu: $LL.common.actions.openMenu(),
		pagination: $LL.common.ui.pagination(),
		previous: $LL.common.ui.previous(),
		previousSlide: $LL.common.ui.previousSlide(),
		recordNotFound: $LL.common.messages.recordNotFound(),
		recordNotFoundDescription: $LL.common.messages.recordNotFoundDescription(),
		refusal: (failure: unknown) => toRefusalText(failure, $LL),
		sidebar: $LL.common.ui.sidebar(),
		toggleSidebar: $LL.common.ui.toggleSidebar(),
		unexpectedError: $LL.common.messages.unexpectedError(),
		unnamedRecord: $LL.common.deleteDialog.unnamedRecord(),
		working: $LL.common.actions.working()
	});

	/**
	 * what the features draw beside the frame, the invite and new-workspace dialogs among them:
	 * the shell's `dialogs` place, read off `app/surfaces` in the list's order.
	 */
	const besideTheFrame = slotsAt('dialogs');
</script>

<!--
	the strings and the reading direction every `@rentable/design` component renders with, and
	the one place this application supplies them.

	**drawn only once a locale exists**, which startup's root decides, because both values it
	passes need one: every string resolves to the empty string until a dictionary is loaded, and
	`currentDirection` reads a locale that is the thing not there.

	**what keeps the screens drawn before a locale safe is narrower than it looks, and it is not
	that they render nothing packaged.** a packaged component reached outside this provider throws,
	and that screen is the one with no boundary above it and no way out but quitting. there are two
	ways in, and each is held shut by a prop rather than by structure:

	`startup/component/unreadable.svelte` draws a `StandaloneSurface`, and that block draws a packaged `Spinner`.
	two things stop it, either of them on its own: the surface is given `tone="error"`, which
	takes the branch that holds no spinner, and it is given no `busy`, which gates the spinner
	inside the other branch.

	it also draws two `SurfaceAction`s, and that block's tooltip is packaged as of #779. one
	thing stops it: `tooltip={false}` at both call sites, against a prop that defaults to true.
	`TooltipProvider` is inside this provider too, so the root throws before the content would.

	both guards are written down at their call sites rather than only here. neither is covered
	by a test, which #794 is for.

	**outside the boundary rather than inside it**, so that the surface drawn when the shell
	throws is drawn with the same words. it supplies context and renders nothing, so there is
	nothing here for a boundary to catch.
-->
<DesignProvider strings={designStrings} direction={currentDirection}>
	<!--
		The outer of the application's two boundaries, and the honest floor under requirement 8.

		The inner one, inside the frame, catches everything a route drew and leaves the chrome
		standing. It cannot catch the chrome itself: a boundary draws its fallback in place of what
		threw, so a card drawn inside a rail that just threw throws again. This one is outside all
		of it, and what it draws is the shared standalone surface with no frame around it at all.

		That is the one state requirement 6 otherwise forbids in a running application, and it is
		allowed here because the alternative is a blank window nobody can leave without quitting.
	-->
	<svelte:boundary
		onerror={(error) =>
			recordDiagnosticError(CAUGHT_ERROR_EVENT, toCaughtErrorFields('shell', error))}
	>
		<QueryClientProvider client={queryClient}>
			<NotificationProvider>
				<TooltipProvider>
					<!-- the rail's way in navigates, and that is the whole mechanism: signed out,
					     `startupScreen` draws the card over every address but the ones `OPENS_SIGNED_OUT`
					     holds, so leaving one of those is what puts the card on screen. From anywhere else
					     the card is already drawn and `wayInFrom` answers nothing, which is what keeps the
					     reader's place. Starting the flow stays with the card, the one surface that
					     names the provider. -->
					<ShellFrame {currentDirection} {shell} {onWayIn} {onSwitchWorkspace}>
						{@render children()}
					</ShellFrame>

					<!-- the invite and new-workspace dialogs, mounted once and beside the frame rather
					     than inside it, since the frame owns navigation and not forms. Inside the
					     providers, because the host's mutations read the query client from context.
					     Drawn while the rail is up and a session is held: that is every state in which
					     one of their openers, the rail's menu or the organization page, can be drawn. -->
					{#if dialogs}
						{#each besideTheFrame as Dialogs, index (index)}
							<Dialogs />
						{/each}
					{/if}
				</TooltipProvider>
			</NotificationProvider>
		</QueryClientProvider>

		{#snippet failed(error, reset)}
			<!-- the reading direction and the full window, which is everything the frame would have
			     given this surface and all of it that survives the frame having thrown. -->
			<div
				lang={$locale}
				dir={currentDirection}
				class="flex h-screen w-screen flex-col overflow-y-auto bg-background"
			>
				<ShellCaughtError {error} onRetry={reset} />
			</div>
		{/snippet}
	</svelte:boundary>
</DesignProvider>
