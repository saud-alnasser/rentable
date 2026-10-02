<script lang="ts">
	import ConfirmDialog from '@rentable/design/block/confirm-dialog.svelte';
	import SettingsGroup from '@rentable/design/block/settings-group.svelte';
	import SettingsRow from '@rentable/design/block/settings-row.svelte';
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
	 * **A card titled for the stamp, with one row, the image** (effort 846, requirements 1 and 13,
	 * and *Everything in a tab is a card*): its preview as the row's value, drawn on paper as it
	 * prints. What the stamp is for is the card's one line. *The row was named for the mark itself
	 * until the card took that title.*
	 *
	 * **The preview is the control** (effort 846, ticket 34, at the human's word of 2026-10-02:
	 * "the replace image button of seal; it should be the preview show if clicked it opens file
	 * system to replace it"). For a holder of `manageMark` the preview is a button named *replace
	 * image*, or *choose image* while it is empty, with the same words in its tooltip, and a small
	 * glyph on its corner saying it can be changed; pressing it opens the system's file picker.
	 * The thing changed is the thing pressed, the way a profile picture is. *It sat beside a
	 * replace image button, the preview only a picture, until ticket 34.*
	 *
	 * **Removing it sits on the picture, in the error tone, and asks first** (requirement 2, and
	 * ticket 36 at the human's word of 2026-10-02: "needs to be integrated in into the part of the
	 * image not a separate thing"). A small icon button on the preview's top corner, beside the
	 * preview rather than inside it, red on the button alone and named *remove organization stamp*
	 * by its label and its tooltip; with no stamp there is none. It takes the image off every
	 * receipt and schedule on every machine, and nothing brings that image back but choosing it
	 * again, so the question says both. *It was a plain ghost button beside the choose until effort
	 * 846, then the card's end row until ticket 36.*
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
		class="paper flex h-14 w-28 items-center justify-center rounded-lg border border-border bg-card p-1.5 transition-colors group-hover:border-ring"
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
		<div class="relative">
			<Tooltip.Root>
				<Tooltip.Trigger>
					{#snippet child({ props })}
						<Button
							{...props}
							variant="ghost"
							class="group relative h-auto rounded-lg p-0 hover:bg-transparent"
							aria-label={label}
							disabled={busy}
							data-organization-mark-choose
							onclick={() => void choose()}
						>
							{@render paper()}
							<!-- says the picture can be changed; the button's name says how. -->
							<span
								class="shadow-xs absolute end-1 bottom-1 grid size-5 place-items-center rounded-full border border-border bg-background text-foreground"
								aria-hidden="true"
							>
								<ImageUpIcon class="size-3" />
							</span>
						</Button>
					{/snippet}
				</Tooltip.Trigger>
				<Tooltip.Content side="top" sideOffset={8} data-organization-mark-choose-hint>
					<span class="first-letter:uppercase">{label}</span>
				</Tooltip.Content>
			</Tooltip.Root>
			{#if mark}
				<!-- the remove sits on the picture it takes away, at the top corner across from the
				     replace glyph: the preview's sibling, never inside it, and red on itself alone. -->
				<Tooltip.Root>
					<Tooltip.Trigger>
						{#snippet child({ props })}
							<Button
								{...props}
								type="button"
								variant="outline"
								size="icon-sm"
								class="shadow-xs absolute -end-2.5 -top-2.5 size-6 rounded-full bg-background {tone(
									{
										tone: 'error'
									}
								).text()} hover:bg-destructive/10 hover:text-destructive"
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
		{#snippet rows()}
			<SettingsRow icon={ImageIcon} name={$LL.organization.mark.image()} value={preview} />
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
