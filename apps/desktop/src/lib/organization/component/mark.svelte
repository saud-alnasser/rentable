<script lang="ts">
	import { Button } from '@rentable/design/primitive/button/index.js';
	import * as Field from '@rentable/design/primitive/field/index.js';
	import { LL } from '$lib/i18n/i18n-svelte';
	import {
		useClearOrganizationMark,
		useFetchOrganizationMark,
		useSetOrganizationMark
	} from '$lib/organization/query';
	import { tauri } from '$lib/platform/tauri';
	import ImageIcon from '@lucide/svelte/icons/image';

	/**
	 * The organization's signature or seal, the one image printed at the foot of every receipt and
	 * schedule (effort 835, requirement 13).
	 *
	 * **The owner and administrators change it; everybody sees it.** A member meets the image, or
	 * the line saying there is none, and a sentence naming who can change it, and no control: an
	 * act offered and then refused would be a question they cannot answer. The host refuses a
	 * member's write as well, so nothing here is the only gate.
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

	async function choose() {
		const path = await tauri.dialog.openImage();

		if (path) {
			// a refusal is already said by the mutation's toast.
			await setMark.mutateAsync(path).catch(() => undefined);
		}
	}
</script>

<Field.Set data-organization-mark>
	<Field.Legend>{$LL.organization.mark.title()}</Field.Legend>
	<Field.Description>
		{$LL.organization.mark.description()}
		{#if !setsMark}
			{$LL.organization.mark.readOnly()}
		{/if}
	</Field.Description>

	<!-- drawn on paper, as it will print: light whatever the window is in. -->
	<div
		class="paper flex h-28 items-center justify-center rounded-xl border border-border bg-card p-3"
	>
		{#if mark}
			<img
				src="data:{mark.mediaType};base64,{mark.data}"
				alt={$LL.organization.mark.alt()}
				class="max-h-full max-w-full object-contain"
				data-organization-mark-image
			/>
		{:else}
			<p class="text-sm text-muted-foreground first-letter:uppercase" data-organization-mark-none>
				{$LL.organization.mark.none()}
			</p>
		{/if}
	</div>

	{#if setsMark}
		<div class="flex flex-wrap gap-3">
			<Button
				type="button"
				variant="outline"
				disabled={busy}
				onclick={() => void choose()}
				data-organization-mark-choose
			>
				<ImageIcon class="size-4" />
				<span class="first-letter:uppercase">
					{mark ? $LL.organization.mark.replace() : $LL.organization.mark.choose()}
				</span>
			</Button>
			{#if mark}
				<Button
					type="button"
					variant="ghost"
					disabled={busy}
					onclick={() => void clearMark.mutateAsync().catch(() => undefined)}
					data-organization-mark-remove
				>
					<span class="first-letter:uppercase">{$LL.organization.mark.remove()}</span>
				</Button>
			{/if}
		</div>
	{/if}
</Field.Set>
