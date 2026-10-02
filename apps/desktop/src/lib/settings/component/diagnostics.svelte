<script lang="ts">
	import SettingsGroup from '@rentable/design/block/settings-group.svelte';
	import SettingsRow from '@rentable/design/block/settings-row.svelte';
	import { Button } from '@rentable/design/primitive/button/index.js';
	import * as Tooltip from '@rentable/design/primitive/tooltip/index.js';
	import { reducesMotion } from '@rentable/design/reduces-motion.js';
	import { LL } from '$lib/i18n/i18n-svelte';
	import ActivityIcon from '@lucide/svelte/icons/activity';
	import FolderIcon from '@lucide/svelte/icons/folder';
	import FolderOpenIcon from '@lucide/svelte/icons/folder-open';
	import ScrollTextIcon from '@lucide/svelte/icons/scroll-text';
	import { onDestroy } from 'svelte';

	/**
	 * Where this installation writes down what went wrong, as a card of the general section: the
	 * folder, its whole path as the row's meta line, and the act that opens it.
	 *
	 * **The whole path is the line under the folder's name, and nothing folds** (effort 846,
	 * requirement 1 as revised on 2026-10-02, at the human's word: "whey there's a collapsoable on
	 * the diangostics"). A path is one line of facts a reader copies or reads out to somebody
	 * helping them, and in a card the column's whole width it has room to stand whole, wrapping
	 * where it must. *It was cut to one line with the whole of it folded under a chevron until
	 * ticket 31 of effort 846.*
	 *
	 * **The act is an icon control named by a tooltip** (the human's word: "the open log oflder
	 * should be just hte icon"), as [[contexts/desktop/components]] gives a short hint: an icon
	 * control's words. The glyph is the one the two startup-failure screens put this same action
	 * behind (`startup/component/error.svelte` and `unreadable.svelte`, `FolderOpenIcon` with this
	 * same string), and the string is the control's accessible name as well as its tooltip, so a
	 * screen reader and a pointer meet the same words. The row leads with the log's own glyph
	 * (`scroll-text`) rather than the folder, so the control is the one folder on the row (ticket
	 * 38: no button repeats its row's glyph).
	 *
	 * **The folder opens when it is pressed** (effort 846, ticket 34, at the human's word of
	 * 2026-10-02: "the open log the folder icon needs to be look like it opend when clicked with
	 * animtion"). At rest the control is a closed folder; pressing it crosses to the open one, the
	 * two glyphs fading and scaling through each other on the quick duration and the move easing,
	 * and it closes again once the system's folder has had time to come up (`OPEN_FOR`). The glyph
	 * says what was just done rather than what will be: the act's words stay *open log folder*. A
	 * reader who asked for less motion is asked as they press (`reducesMotion`), and the folder
	 * changes at once, with no crossing; the media query holds it still as well.
	 *
	 * What the record is for is said once, in the card's header, rather than inside the row.
	 */
	let {
		diagnosticsDir,
		onRevealDiagnostics
	}: {
		diagnosticsDir: string;
		onRevealDiagnostics: () => void;
	} = $props();

	/**
	 * how long the folder stands open after a press: about as long as the system takes to bring
	 * the folder up, so the glyph closes once the reader has met what it opened. A hold, not a
	 * motion duration; the crossing itself is the tokens'.
	 */
	const OPEN_FOR = 1200;

	let opened = $state(false);
	/** the reader asked for less motion, read at the press, so the glyphs swap without crossing. */
	let holdsStill = $state(reducesMotion());
	let closing: ReturnType<typeof setTimeout> | undefined;

	function reveal() {
		holdsStill = reducesMotion();
		opened = true;
		clearTimeout(closing);
		closing = setTimeout(() => {
			opened = false;
		}, OPEN_FOR);
		onRevealDiagnostics();
	}

	onDestroy(() => clearTimeout(closing));

	/** the crossing between the two glyphs, or none where the reader asked for less motion. */
	const crossing = $derived(
		holdsStill
			? ''
			: 'transition-[opacity,scale] duration-quick ease-move motion-reduce:transition-none'
	);
</script>

<!-- the path is the machine's, not the reader's language: isolated so an ltr path keeps its own
     order, while the line it stands on keeps the reader's direction and starts under the name. -->
{#snippet path()}
	<span class="block break-all select-text" data-diagnostics-path>
		<bdi dir="ltr">{diagnosticsDir}</bdi>
	</span>
{/snippet}

<div data-diagnostics class="contents">
	<SettingsGroup
		icon={ActivityIcon}
		title={$LL.settings.diagnosticsTitle()}
		description={$LL.settings.diagnosticsDescription()}
	>
		{#snippet rows()}
			<SettingsRow
				icon={ScrollTextIcon}
				name={$LL.settings.diagnosticsFolder()}
				meta={diagnosticsDir ? path : undefined}
			>
				{#snippet control()}
					<Tooltip.Root>
						<Tooltip.Trigger>
							{#snippet child({ props })}
								<Button
									{...props}
									variant="outline"
									size="icon-sm"
									aria-label={$LL.settings.diagnosticsReveal()}
									disabled={!diagnosticsDir}
									data-diagnostics-reveal
									data-opened={opened}
									onclick={reveal}
								>
									<!-- the closed folder and the open one in one cell, one shown at a time, so
									     the press crosses from one to the other in place. -->
									<span class="grid size-4 place-items-center" aria-hidden="true">
										<FolderIcon
											class="col-start-1 row-start-1 size-4 {crossing} {opened
												? 'scale-75 opacity-0'
												: 'scale-100 opacity-100'}"
											data-diagnostics-reveal-glyph="closed"
										/>
										<FolderOpenIcon
											class="col-start-1 row-start-1 size-4 {crossing} {opened
												? 'scale-100 opacity-100'
												: 'scale-75 opacity-0'}"
											data-diagnostics-reveal-glyph="open"
										/>
									</span>
								</Button>
							{/snippet}
						</Tooltip.Trigger>
						<Tooltip.Content side="top" sideOffset={8} data-diagnostics-reveal-hint>
							{$LL.settings.diagnosticsReveal()}
						</Tooltip.Content>
					</Tooltip.Root>
				{/snippet}
			</SettingsRow>
		{/snippet}
	</SettingsGroup>
</div>
