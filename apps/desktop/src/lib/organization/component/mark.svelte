<script lang="ts">
	import ConfirmDialog from '@rentable/design/block/confirm-dialog.svelte';
	import SettingsGroup from '@rentable/design/block/settings-group.svelte';
	import SettingsRow from '@rentable/design/block/settings-row.svelte';
	import { Button } from '@rentable/design/primitive/button/index.js';
	import { tone } from '@rentable/design/tone.js';
	import { LL } from '$lib/i18n/i18n-svelte';
	import {
		useClearOrganizationMark,
		useFetchOrganizationMark,
		useSetOrganizationMark
	} from '$lib/organization/query';
	import { tauri } from '$lib/platform/tauri';
	import ImageIcon from '@lucide/svelte/icons/image';
	import Trash2Icon from '@lucide/svelte/icons/trash-2';

	/**
	 * The organization's signature or seal, the one image printed at the foot of every receipt and
	 * schedule (effort 835, requirement 13), as a settings group of its own.
	 *
	 * **One row, the mark, with its preview as the value** (effort 846, requirements 1 and 13), and
	 * choosing or replacing it as the row's control. What the mark is for is the group's one line.
	 *
	 * **Removing it is the group's end row, in the error tone, and asks first** (requirement 2): it
	 * takes the image off every receipt and schedule on every machine, and nothing brings that image
	 * back but choosing it again, so the question says both. *It was a plain ghost button beside the
	 * choose, with no glyph and no question, until effort 846.*
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

{#snippet preview()}
	<!-- drawn on paper, as it will print: light whatever the window is in. -->
	<div
		class="paper flex h-16 w-32 items-center justify-center rounded-lg border border-border bg-card p-1.5"
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

{#snippet chooseControl()}
	<!-- outline rather than solid, since the act is offered and never invited. -->
	<Button
		type="button"
		variant="outline"
		size="sm"
		disabled={busy}
		onclick={() => void choose()}
		data-organization-mark-choose
	>
		<ImageIcon class="size-4" />
		<span class="first-letter:uppercase">
			{mark ? $LL.organization.mark.replace() : $LL.organization.mark.choose()}
		</span>
	</Button>
{/snippet}

{#snippet removeRow()}
	<SettingsRow icon={Trash2Icon} name={$LL.organization.mark.removeTitle()} tone="error">
		{#snippet control({ labelId })}
			<!-- labelled by the row's name, which says what goes, rather than by its one verb. -->
			<Button
				type="button"
				variant="ghost"
				size="sm"
				class="{tone({ tone: 'error' }).text()} hover:bg-destructive/10 hover:text-destructive"
				aria-labelledby={labelId}
				disabled={busy}
				data-organization-mark-remove
				onclick={() => {
					confirming = true;
				}}
			>
				<Trash2Icon class="size-4" />
				{$LL.organization.mark.remove()}
			</Button>
		{/snippet}
	</SettingsRow>
{/snippet}

<div data-organization-mark>
	<SettingsGroup
		footer={setsMark
			? $LL.organization.mark.description()
			: `${$LL.organization.mark.description()} ${$LL.organization.mark.readOnly()}`}
		end={setsMark && mark ? removeRow : undefined}
	>
		{#snippet rows()}
			<SettingsRow
				icon={ImageIcon}
				name={$LL.organization.mark.title()}
				value={preview}
				control={setsMark ? chooseControl : undefined}
			/>
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
