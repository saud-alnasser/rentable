<script lang="ts">
	import FormSurface from '@rentable/design/block/form-surface.svelte';
	import { Button } from '@rentable/design/primitive/button/index.js';
	import * as ToggleGroup from '@rentable/design/primitive/toggle-group/index.js';
	import PrinterIcon from '@lucide/svelte/icons/printer';
	import { LL } from '$lib/i18n/i18n-svelte';
	import { localesMetadata } from '$lib/i18n/i18n-translations-util';
	import type { Locales } from '$lib/i18n/i18n-types';
	import { locales } from '$lib/i18n/i18n-util';
	import type { Snippet } from 'svelte';
	import type { Action } from 'svelte/action';

	/**
	 * A page shown before it is printed, in the application's own surface.
	 *
	 * The system's print preview did not read as part of the application (effort 835, requirement
	 * 10, revised), so a receipt or a schedule opens here first: the page drawn as paper, the
	 * language it is written in, and the two things a page can become, a PDF or paper. It is the
	 * edge panel every write surface opens on, the choice on top and the page below.
	 *
	 * **What is shown is what prints.** The caller draws the page with a snippet taking the chosen
	 * language, and hands that same snippet to the print sheet; this scales it to the panel and
	 * nothing else. The page sits in `.paper`, which carries the light tokens whatever the window is
	 * in, because paper is light.
	 */
	let {
		open,
		onOpenChange,
		title,
		locale = $bindable(),
		page,
		busy = false,
		onSave,
		onPrint
	}: {
		open: boolean;
		onOpenChange: (value: boolean) => void;
		/** what is being printed, as the act that opened this names it. */
		title: string;
		/** the language the page is written in; it opens on the application's own. */
		locale: Locales;
		/** the page, drawn in the language given. */
		page: Snippet<[Locales]>;
		/** a print or a save is running, and neither is offered again until it is done. */
		busy?: boolean;
		onSave: () => void;
		onPrint: () => void;
	} = $props();

	/** A4 at the width a browser lays it out at, 210mm at 96 pixels an inch. */
	const PAGE_WIDTH = 794;

	let frameWidth = $state(0);
	let pageHeight = $state(0);

	const scale = $derived(frameWidth > 0 ? Math.min(1, frameWidth / PAGE_WIDTH) : 0);

	const isLocale = (value: string): value is Locales =>
		(locales as readonly string[]).includes(value);

	// *print* is the panel's primary act, so it is what the form submits.
	const enhance: Action<HTMLFormElement> = (form) => {
		const submit = (event: SubmitEvent) => {
			event.preventDefault();

			if (!busy) onPrint();
		};

		form.addEventListener('submit', submit);

		return { destroy: () => form.removeEventListener('submit', submit) };
	};
</script>

<FormSurface {open} {onOpenChange} {enhance} weight="heavy" {title}>
	<div class="flex flex-col gap-4">
		<!-- held while a page is on its way, so the page sent is the page chosen. -->
		<ToggleGroup.Root
			type="single"
			variant="outline"
			aria-label={$LL.print.language()}
			class="w-full"
			data-print-language
			disabled={busy}
			bind:value={
				() => locale,
				(value) => {
					// a page is always in one language, so pressing the chosen one keeps it.
					if (isLocale(value)) locale = value;
				}
			}
		>
			{#each locales as loc (loc)}
				<ToggleGroup.Item value={loc} class="flex-1" data-locale={loc}>
					{localesMetadata[loc].label}
				</ToggleGroup.Item>
			{/each}
		</ToggleGroup.Root>

		<!-- the page at its printed width, scaled down to the panel: a document, not a form. -->
		<div class="rounded-xl bg-muted p-4">
			<!-- measured inside the frame's padding, so the page is scaled to the box it sits in. -->
			<div
				class="relative overflow-hidden"
				style:height="{pageHeight * scale}px"
				bind:clientWidth={frameWidth}
				data-print-preview
			>
				<div
					class="paper absolute start-0 top-0 origin-top-left bg-card p-16 text-foreground shadow-raised rtl:origin-top-right"
					style:width="{PAGE_WIDTH}px"
					style:transform="scale({scale})"
					bind:offsetHeight={pageHeight}
				>
					{@render page(locale)}
				</div>
			</div>
		</div>
	</div>

	{#snippet actions()}
		<Button type="button" variant="outline" disabled={busy} onclick={onSave} data-print-save>
			<span class="first-letter:uppercase">{$LL.print.save()}</span>
		</Button>
		<Button type="submit" disabled={busy} data-print-paper>
			<PrinterIcon class="size-4" />
			<span class="first-letter:uppercase">{$LL.print.print()}</span>
		</Button>
	{/snippet}
</FormSurface>
