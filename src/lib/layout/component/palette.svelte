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
	import { LL } from '$lib/i18n/i18n-svelte';
	import type { TranslationFunctions } from '$lib/i18n/i18n-types';
	import { primaryDestinations, secondaryDestinations } from '$lib/layout/destination';
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

	const destinations = $derived([...primaryDestinations, ...secondaryDestinations]);

	// the physical key is matched as well as the character it produces: under an Arabic
	// keyboard layout that key reports as `ك`, and the palette has to open in both locales.
	function isShortcutKey(event: KeyboardEvent) {
		return event.key === SHORTCUT_KEY || event.code === `Key${SHORTCUT_KEY.toUpperCase()}`;
	}

	function handleShortcut(event: KeyboardEvent) {
		if (!isShortcutKey(event) || !(event.metaKey || event.ctrlKey)) {
			return;
		}

		event.preventDefault();
		open = !open;
	}
</script>

<svelte:window onkeydown={handleShortcut} />

<Command.Dialog bind:open>
	<Command.Input placeholder={$LL.common.table.searchPlaceholder()} />
	<Command.List>
		<Command.Empty>{$LL.common.ui.commandPaletteEmpty()}</Command.Empty>

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
			{#each createActions as action (action.href)}
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
