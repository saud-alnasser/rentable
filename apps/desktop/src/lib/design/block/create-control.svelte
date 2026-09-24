<script lang="ts">
	import { Button } from '@rentable/design/primitive/button/index.js';
	import { Kbd } from '@rentable/design/primitive/kbd/index.js';
	import * as Tooltip from '@rentable/design/primitive/tooltip/index.js';
	import { toShortcutHint, usesAppleKeyboard } from '@rentable/design/shortcut.js';
	import { CREATE_KEYS } from '$lib/design/create-key';
	import { createTargets } from '$lib/design/create-target.svelte';
	import PlusIcon from '@lucide/svelte/icons/plus';
	import { untrack } from 'svelte';

	/**
	 * The one way a set offers to add a record to it.
	 *
	 * **One control, in one place, on every set** (effort 832, requirement 9): the last control at
	 * the end of the bar above the records. The list shell draws it at the end of its toolbar and the
	 * settings directories at the end of their tray, and nothing else draws a create of its own
	 * ([[rules/interface]], *Create*). Quiet and glyph-only, with its words in a tooltip and on the
	 * control itself: a set is read before anything is added to it, so the control that adds is
	 * found without competing with the records.
	 *
	 * **While it is drawn, it is the set on screen.** It holds its place in `create-target`, and the
	 * create key asks whoever holds the last place. So the key and the control cannot come to create
	 * in two different sets, and a screen whose set may not be added to draws no control and answers
	 * the key with its reason.
	 */
	let {
		label,
		onCreate,
		...marks
	}: {
		/** what pressing it adds, translated: the tooltip, and the control's accessible name. */
		label: string;
		/** ask the concept's host for its create form. */
		onCreate: () => void;
	} & {
		/** marks a surface reads its control by, such as `data-invite-open`. Nothing else passes. */
		[mark: `data-${string}`]: boolean | string | undefined;
	} = $props();

	// taken once, when the control is drawn, and given back when it goes. Untracked, because taking
	// a place reads the places held and an effect that reads what it writes never settles. What it
	// creates is read at the moment of pressing, so a set whose create changes while it is drawn is
	// not asked for the one it had before.
	$effect(() => untrack(() => createTargets.hold({ create: () => onCreate() })));

	const hint = toShortcutHint(CREATE_KEYS, usesAppleKeyboard());
</script>

<Tooltip.Root>
	<Tooltip.Trigger>
		{#snippet child({ props })}
			<Button
				{...props}
				{...marks}
				variant="outline"
				size="icon-sm"
				data-create-control
				aria-label={label}
				aria-keyshortcuts="Control+N Meta+N"
				onclick={() => onCreate()}
			>
				<PlusIcon />
			</Button>
		{/snippet}
	</Tooltip.Trigger>
	<Tooltip.Content side="top" sideOffset={8}>
		{label}
		<!-- a key name is not prose, so it reads left to right in both locales. -->
		<Kbd dir="ltr">{hint}</Kbd>
	</Tooltip.Content>
</Tooltip.Root>
