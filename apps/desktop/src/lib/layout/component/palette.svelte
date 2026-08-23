<script lang="ts" module>
	import {
		toShortcutHint,
		usesAppleKeyboard,
		type ShortcutCombination
	} from '@rentable/design/shortcut.js';

	/** The keys that open and close the palette. */
	const SHORTCUT_KEYS: ShortcutCombination = { key: 'k', command: true };

	// the modifier is whichever one the platform's own shortcuts use, and both are accepted,
	// so the hint has to name the one the reader will reach for rather than a fixed word.
	/** What a trigger prints for the shortcut this palette listens for. */
	export const PALETTE_SHORTCUT_HINT = toShortcutHint(SHORTCUT_KEYS, usesAppleKeyboard());
</script>

<script lang="ts">
	import { resolve } from '$app/paths';
	import type { ResolvedPathname } from '$app/types';
	import { withCreateIntent } from '@rentable/design/create-intent.js';
	import { Kbd, KbdGroup } from '@rentable/design/primitive/kbd/index.js';
	import * as Command from '@rentable/design/primitive/command/index.js';
	import { shortcuts } from '$lib/design/shortcut-registry.svelte';
	import { LL } from '$lib/i18n/i18n-svelte';
	import type { TranslationFunctions } from '$lib/i18n/i18n-types';
	import { primaryDestinations, secondaryDestinations } from '$lib/layout/destination';
	import {
		matchesTerm,
		toPaletteVerbs,
		type PaletteVerb,
		type RecordPaletteVerb
	} from '$lib/layout/palette';
	import { recordConcepts } from '$lib/layout/record-search';
	import BoltIcon from '@tabler/icons-svelte/icons/bolt';
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

	// the action waiting for a record, where the reader chose one that needs one. While it is
	// held the palette shows nothing but that concept's records: an action that has been asked
	// for is a question, and the other things the palette offers are not answers to it.
	let asking = $state<RecordPaletteVerb | null>(null);

	// which keyboard this is does not change while the window is open, so it is read once
	// rather than once per action.
	const isAppleKeyboard = usesAppleKeyboard();

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

	// every action the application registered, narrowed by the same comparison as everything else
	// the palette shows by name. Nothing about them is written here — a shortcut or a verb
	// registered anywhere arrives in this list with no edit to this file.
	const verbs = $derived(
		toPaletteVerbs(shortcuts.registered, $LL, isAppleKeyboard).filter((verb) =>
			matchesTerm(verb.label, term)
		)
	);

	// while an action is holding the palette, only the concept it asked for is searched: the other
	// four would run on every keystroke and have their answers thrown away, and the term is being
	// typed at a question about contracts rather than at the palette. An empty term is below the
	// search's own minimum, so each of them simply does not run.
	const found = recordConcepts.map((concept) => ({
		concept,
		query: concept.find(() => (asking && asking.subject !== concept.subject ? '' : term))
	}));

	// the concept the held action is asking for, and the records it has found. A subject naming
	// no concept finds none, which is the honest answer: the shell searches what it searches.
	const askedFor = $derived(
		asking ? found.find((group) => group.concept.subject === asking?.subject) : undefined
	);

	/** Run an action, or hold it while the reader chooses the record it acts on. */
	function choose(verb: PaletteVerb) {
		if (verb.unavailable) {
			return;
		}

		// against `undefined` rather than for truth: a concept named by an empty string is falsy
		// and still a question, and answering it by running the verb would run it on nothing.
		if (verb.subject !== undefined) {
			asking = verb;
			// the words that found the action are not the words that find the record, and leaving
			// them in place would narrow the concept's search to a term nobody typed at it.
			term = '';

			return;
		}

		verb.run();
		open = false;
	}

	/** Run the held action on the record the reader chose for it. */
	function runAsked(recordId: string) {
		asking?.run(recordId);
		open = false;
	}

	// the palette opens on everything it offers. Without this the second opening comes up still
	// narrowed by the last search, or still holding a question the reader walked away from.
	$effect(() => {
		if (!open) {
			term = '';
			asking = null;
		}
	});

	// registered rather than listened for: the keydown reaches the application's one listener,
	// and the sheet reads what is registered here without being told about it.
	$effect(() =>
		shortcuts.register({
			id: 'palette.toggle',
			scope: 'application',
			keys: [SHORTCUT_KEYS],
			describe: (translations) => translations.common.ui.commandPalette(),
			// the one shortcut the palette does not offer by name: inside the palette it is a row
			// that closes the palette, which is what the escape key is already for.
			offeredInPalette: false,
			run: () => (open = !open)
		})
	);
</script>

<Command.Dialog bind:open shouldFilter={false}>
	<Command.Input bind:value={term} placeholder={$LL.common.table.searchPlaceholder()} />
	<Command.List>
		{#if asking}
			<!-- outside the group, and not a command item: an empty group renders as nothing, and
			     nothing is exactly the wrong answer to a question. This is what the reader sees
			     between choosing the action and having typed enough to find the record. -->
			<p class="px-3 py-3 text-sm text-muted-foreground">
				{$LL.common.ui.commandPaletteChooseRecord()}
			</p>

			<!-- the action is holding the palette, so the palette shows only what it asked for. The
			     heading is the action's own name, which is what says why this list is the only one
			     here and what choosing from it will do. -->
			<Command.Group heading={asking.label}>
				{#each askedFor?.query.data ?? [] as match (match.id)}
					<Command.Item value={String(match.id)} onSelect={() => runAsked(match.id)}>
						<FileIcon />
						<span class="min-w-0 flex-1 truncate">{match.label}</span>
						<span class="shrink-0 truncate text-xs text-muted-foreground">{match.hint}</span>
					</Command.Item>
				{/each}
			</Command.Group>
		{:else}
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

			{#if verbs.length > 0}
				<Command.Separator />

				<!-- actions come last, under the two groups that navigate: the palette is still
				     reached with a record or a page in mind most of the time, and an action is what
				     the reader asks for by name once they know it is there. -->
				<Command.Group heading={$LL.common.actions.actions()}>
					{#each verbs as verb (verb.id)}
						<Command.Item
							value={verb.id}
							disabled={Boolean(verb.unavailable)}
							onSelect={() => choose(verb)}
							class="capitalize"
						>
							<BoltIcon />
							<span class="min-w-0 flex-1 truncate">{verb.label}</span>

							<!-- the reason sits where the keys would, because it is the answer to the same
							     question: a row that refuses says why in the place the reader is already
							     looking for what the row will do. -->
							{#if verb.unavailable}
								<span class="shrink-0 truncate text-xs text-muted-foreground">
									{verb.unavailable}
								</span>
							{:else if verb.hints.length > 0}
								<!-- a key name is not prose: it is what is printed on the keyboard, and the
								     keyboard does not change with the locale. -->
								<KbdGroup dir="ltr" class="shrink-0">
									{#each verb.hints as hint (hint)}
										<Kbd>{hint}</Kbd>
									{/each}
								</KbdGroup>
							{/if}
						</Command.Item>
					{/each}
				</Command.Group>
			{/if}
		{/if}
	</Command.List>
</Command.Dialog>
