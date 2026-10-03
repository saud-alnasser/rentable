<script lang="ts">
	import ConfirmDialog from '@rentable/design/block/confirm-dialog.svelte';
	import SettingsGroup from '@rentable/design/block/settings-group.svelte';
	import { Button } from '@rentable/design/primitive/button/index.js';
	import * as Tooltip from '@rentable/design/primitive/tooltip/index.js';
	import { tone } from '@rentable/design/tone.js';
	import { LL } from '$lib/i18n/i18n-svelte';
	import {
		useClearOrganizationMark,
		useFetchOrganizationMark,
		useSetOrganizationMark
	} from '$lib/organization/query';
	import { tauri } from '$lib/platform/tauri';
	import ImageIcon from '@lucide/svelte/icons/image';
	import ImageUpIcon from '@lucide/svelte/icons/image-up';
	import Trash2Icon from '@lucide/svelte/icons/trash-2';

	/**
	 * The organization stamp, the one image printed at the foot of every receipt and schedule
	 * (effort 835, requirement 13), as a settings group of its own. The reader meets it as the
	 * *organization stamp* wherever it is named; the code keeps calling it the mark. *It was named
	 * the signature or seal until the human's walk of 2026-10-02 (effort 846, ticket 36).*
	 *
	 * **A card titled for the stamp, and nothing under its header** (effort 846, requirements 1 and
	 * 13, and *Everything in a tab is a card*): the preview, drawn on paper as it prints, sits at the
	 * header's trailing edge beside the title and the card's one line, mirrored in Arabic, and the
	 * card has no rows. It is top-aligned with the title, as the header lays everything at its end,
	 * so the title is read first and the picture's height never pushes the words down. *The picture
	 * was the value of an image row under the header until ticket 47, at the human's word of
	 * 2026-10-03: "the image neexsc on the righrt side no need to be under".*
	 *
	 * **The preview is the control** (effort 846, ticket 34, at the human's word of 2026-10-02:
	 * "the replace image button of seal; it should be the preview show if clicked it opens file
	 * system to replace it"). For a holder of `manageMark` the preview is a button named *replace
	 * image*, or *choose image* while it is empty, with the same words in its tooltip, and a small
	 * glyph inside its corner saying it can be changed; pressing it opens the system's file picker.
	 * The thing changed is the thing pressed, the way a profile picture is. *It sat beside a
	 * replace image button, the preview only a picture, until ticket 34.*
	 *
	 * **Removing it sits on the picture, in the error tone, and asks first** (requirement 2, and
	 * ticket 36 at the human's word of 2026-10-02: "needs to be integrated in into the part of the
	 * image not a separate thing"). A small icon button inside the preview's top corner, the
	 * preview's sibling rather than inside its button, red on the button alone and named *remove organization stamp*
	 * by its label and its tooltip; with no stamp there is none. It takes the image off every
	 * receipt and schedule on every machine, and nothing brings that image back but choosing it
	 * again, so the question says both. *It was a plain ghost button beside the choose until effort
	 * 846, then the card's end row until ticket 36.*
	 *
	 * **The two corner controls are one pair** (ticket 47, at the human's word of 2026-10-03: "the
	 * button of delete and add a littilbe bit needs to be worked on"). The replace glyph and the
	 * remove are the same small disc, quiet on a frosted ground, set inside the picture's trailing
	 * edge, the remove at the top and the replace glyph at the bottom, as a photo editor badges an
	 * avatar. Neither hangs past the picture's edge, and they are always shown, since a control a
	 * pointer must find first is one a keyboard or a touch never meets. The picture is drawn a step
	 * larger so the two sit apart. *The remove hung outside the top corner, larger than a replace
	 * glyph half its size, until ticket 47.*

	 *
	 * **A holder of `manageMark` changes it; everybody sees it.** A member without the flag meets
	 * the image, or the line saying there is none, and a sentence naming who can change it, and no
	 * control: an act offered and then refused would be a question they cannot answer. The router
	 * and the host refuse the write as well, so nothing here is the only gate. *It was the owner's
	 * and the administrators' until effort 838 gave the mark a flag.*
	 *
	 * The image is chosen through the open dialog and read by the host from there, which checks it
	 * by its bytes; a refusal (too large, not an image) is the host's sentence in a toast.
	 */
	let { setsMark }: { setsMark: boolean } = $props();

	const markQuery = useFetchOrganizationMark();
	const setMark = useSetOrganizationMark();
	const clearMark = useClearOrganizationMark();

	const mark = $derived(markQuery.data ?? null);
	const busy = $derived(setMark.isPending || clearMark.isPending);

	let confirming = $state(false);

	// the one drawing of the preview's two corner controls, the replace glyph and the remove: the
	// same small disc inside the picture's trailing edge, one at the top and one at the bottom, so
	// they read as a pair placed on purpose rather than two things stuck on.
	const corner =
		'absolute end-1.5 grid size-6 place-items-center rounded-full border border-border bg-background/90 shadow-xs backdrop-blur-sm';

	async function choose() {
		const path = await tauri.dialog.openImage();

		if (path) {
			// a refusal is already said by the mutation's toast.
			await setMark.mutateAsync(path).catch(() => undefined);
		}
	}
</script>

<!-- drawn on paper, as it will print: light whatever the window is in. -->
{#snippet paper()}
	<div
		class="paper flex h-16 w-32 items-center justify-center rounded-lg border border-border bg-card p-1.5 transition-colors group-hover:border-ring"
	>
		{#if mark}
			<img
				src="data:{mark.mediaType};base64,{mark.data}"
				alt={$LL.organization.mark.alt()}
				class="max-h-full max-w-full object-contain"
				data-organization-mark-image
			/>
		{:else}
			<span class="text-xs first-letter:uppercase" data-organization-mark-none>
				{$LL.organization.mark.none()}
			</span>
		{/if}
	</div>
{/snippet}

<!-- the preview, and for a holder of manageMark the preview as the one control that changes it,
     named for what a press does with the same words in its tooltip, and while there is a stamp,
     the remove on its corner. -->
{#snippet preview()}
	{#if setsMark}
		{@const label = mark ? $LL.organization.mark.replace() : $LL.organization.mark.choose()}
		<div class="relative" data-organization-mark-preview>
			<Tooltip.Root>
				<Tooltip.Trigger>
					{#snippet child({ props })}
						<!-- borderless, so the button is exactly the paper and the glyph inside it sits
						     on the same corners the remove beside it is placed against. -->
						<Button
							{...props}
							variant="ghost"
							class="group relative h-auto rounded-lg border-0 p-0 hover:bg-transparent"
							aria-label={label}
							disabled={busy}
							data-organization-mark-choose
							onclick={() => void choose()}
						>
							{@render paper()}
							<!-- says the picture can be changed; the button's name says how. Drawn as the
							     remove is drawn, so the two read as one pair. -->
							<span
								class="{corner} bottom-1.5 text-foreground"
								aria-hidden="true"
								data-organization-mark-corner="replace"
							>
								<ImageUpIcon class="size-3.5" />
							</span>
						</Button>
					{/snippet}
				</Tooltip.Trigger>
				<Tooltip.Content side="top" sideOffset={8} data-organization-mark-choose-hint>
					<span class="first-letter:uppercase">{label}</span>
				</Tooltip.Content>
			</Tooltip.Root>
			{#if mark}
				<!-- the remove sits on the picture it takes away, inside its top corner above the
				     replace glyph: the preview's sibling, never inside it, and red on itself alone. -->
				<Tooltip.Root>
					<Tooltip.Trigger>
						{#snippet child({ props })}
							<Button
								{...props}
								type="button"
								variant="ghost"
								size="icon-xs"
								class="{corner} top-1.5 {tone({
									tone: 'error'
								}).text()} hover:border-destructive/50 hover:bg-background hover:text-destructive"
								data-organization-mark-corner="remove"
								aria-label={$LL.organization.mark.removeTitle()}
								disabled={busy}
								data-organization-mark-remove
								onclick={() => {
									confirming = true;
								}}
							>
								<Trash2Icon class="size-3.5" />
							</Button>
						{/snippet}
					</Tooltip.Trigger>
					<Tooltip.Content side="top" sideOffset={8} data-organization-mark-remove-hint>
						<span class="first-letter:uppercase">{$LL.organization.mark.removeTitle()}</span>
					</Tooltip.Content>
				</Tooltip.Root>
			{/if}
		</div>
	{:else}
		{@render paper()}
	{/if}
{/snippet}

<div data-organization-mark class="contents">
	<SettingsGroup
		icon={ImageIcon}
		title={$LL.organization.mark.title()}
		description={setsMark
			? $LL.organization.mark.description()
			: `${$LL.organization.mark.description()} ${$LL.organization.mark.readOnly()}`}
	>
		{#snippet action()}
			<!-- the header's action slot is pulled out by a text button's inset; the picture has none,
			     so it is put back, and its edge lines up with the card's other text. -->
			<div class="my-1 me-3" data-organization-mark-header>
				{@render preview()}
			</div>
		{/snippet}
	</SettingsGroup>
</div>

<ConfirmDialog
	open={confirming}
	onOpenChange={(open) => {
		confirming = open;
	}}
	onSubmit={async () => {
		await clearMark.mutateAsync();
	}}
	record={$LL.organization.mark.title()}
	title={$LL.organization.mark.removeTitle()}
	description={$LL.organization.mark.removeDescription()}
	confirmLabel={$LL.organization.mark.remove()}
	confirmLoadingLabel={$LL.common.actions.working()}
/>
