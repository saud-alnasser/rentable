<script lang="ts" module>
	/** The key that opens and closes the palette, held with ctrl or command. */
	const SHORTCUT_KEY = 'k';

	// the modifier is whichever one the platform's own shortcuts use, and both are accepted,
	// so the hint has to name the one the reader will reach for rather than a fixed word.
	const isAppleKeyboard =
		typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.userAgent);

	/** What a trigger prints for the shortcut this palette listens for. */
	export const PALETTE_SHORTCUT_HINT = `${isAppleKeyboard ? '⌘' : 'Ctrl'} ${SHORTCUT_KEY.toUpperCase()}`;
</script>

<script lang="ts">
	import { resolve } from '$app/paths';
	import type { ResolvedPathname } from '$app/types';
	import { withCreateIntent } from '$lib/design/create-intent';
	import * as Command from '$lib/design/primitive/command';
	import { matchesShortcutKey } from '$lib/design/shortcut.js';
	import { LL } from '$lib/i18n/i18n-svelte';
	import type { TranslationFunctions } from '$lib/i18n/i18n-types';
	import { primaryDestinations, secondaryDestinations } from '$lib/layout/destination';
	import { matchesTerm, recordConcepts } from '$lib/layout/record-search';
	import FileIcon from '@tabler/icons-svelte/icons/file-description';
	import PlusIcon from '@tabler/icons-svelte/icons/plus';

	type CreateAction = {
		href: ResolvedPathname;
		label: (translations: TranslationFunctions) => string;
	};

	const createActions: CreateAction[] = [
		{ href: resolve(withCreateIntent('/tenants')), label: (t) => t.common.labels.tenant() },
		{ href: resolve(withCreateIntent('/complexes')), label: (t) => t.common.labels.complex() },
		{ href: resolve(withCreateIntent('/contracts')), label: (t) => t.common.labels.contract() }
	];

	let {
		open = $bindable(false)
	}: {
		/** Whether the palette is showing. Bind to it to open the palette from a trigger. */
		open?: boolean;
	} = $props();

	// the term the palette is holding. It reaches the record searches as a query and narrows the
	// destinations here, which is why the command primitive's own filtering is off: records are
	// already narrowed in SQL, and filtering them again on what a row shows would hide a tenant
	// found by phone or a payment found by its date.
	let term = $state('');

	const destinations = $derived(
		[...primaryDestinations, ...secondaryDestinations].filter((destination) =>
			matchesTerm(destination.label($LL), term)
		)
	);
	const creations = $derived(
		createActions.filter(
			(action) =>
				matchesTerm(action.label($LL), term) || matchesTerm($LL.common.actions.create(), term)
		)
	);

	const found = recordConcepts.map((concept) => ({
		concept,
		query: concept.find(() => term)
	}));

	// the palette opens on everything it offers. Without this the second opening comes up still
	// narrowed by the last search, with every destination hidden behind text nobody typed.
	$effect(() => {
		if (!open) {
			term = '';
		}
	});

	function handleShortcut(event: KeyboardEvent) {
		if (!matchesShortcutKey(event, SHORTCUT_KEY) || !(event.metaKey || event.ctrlKey)) {
			return;
		}

		event.preventDefault();
		open = !open;
	}
</script>

<svelte:window onkeydown={handleShortcut} />

<Command.Dialog bind:open shouldFilter={false}>
	<Command.Input bind:value={term} placeholder={$LL.common.table.searchPlaceholder()} />
	<Command.List>
		<Command.Empty>{$LL.common.ui.commandPaletteEmpty()}</Command.Empty>

		<!-- records lead: the palette is reached with one in mind far more often than a page,
		     and a group per concept keeps them apart from the destinations below. -->
		{#each found as group (group.concept.heading($LL))}
			{@const matches = group.query.data ?? []}
			{#if matches.length > 0}
				<Command.Group heading={group.concept.heading($LL)}>
					{#each matches as match (match.id)}
						<Command.LinkItem href={group.concept.href(match)} onSelect={() => (open = false)}>
							<FileIcon />
							<span class="min-w-0 flex-1 truncate">{match.label}</span>
							<span class="shrink-0 truncate text-xs text-muted-foreground">{match.hint}</span>
						</Command.LinkItem>
					{/each}
				</Command.Group>

				<Command.Separator />
			{/if}
		{/each}

		<Command.Group heading={$LL.common.ui.commandPaletteGoTo()}>
			{#each destinations as destination (destination.url)}
				<Command.LinkItem
					href={resolve(destination.url)}
					onSelect={() => (open = false)}
					class="capitalize"
				>
					<destination.icon />
					<span>{destination.label($LL)}</span>
				</Command.LinkItem>
			{/each}
		</Command.Group>

		<Command.Separator />

		<Command.Group heading={$LL.common.actions.create()}>
			{#each creations as action (action.href)}
				<Command.LinkItem
					href={action.href}
					keywords={[$LL.common.actions.create()]}
					onSelect={() => (open = false)}
					class="capitalize"
				>
					<PlusIcon />
					<span>{action.label($LL)}</span>
				</Command.LinkItem>
			{/each}
		</Command.Group>
	</Command.List>
</Command.Dialog>
