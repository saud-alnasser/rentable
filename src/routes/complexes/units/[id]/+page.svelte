<script lang="ts">
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { Button } from '$lib/common/components/fragments/button';
	import * as Tooltip from '$lib/common/components/fragments/tooltip';
	import { LL } from '$lib/i18n/i18n-svelte';
	import UnitsDataView from '$lib/resources/complexes/components/units-data-view.svelte';
	import ArrowLeftIcon from '@lucide/svelte/icons/arrow-left';

	const complexId = Number(page.params.id);
</script>

<div class="mx-auto flex min-h-0 w-full max-w-7xl flex-1 flex-col gap-4 p-5">
	<div class="rounded-[1.25rem] border border-border/70 bg-card/65 p-3 shadow-xl backdrop-blur-xl">
		<div class="flex items-start gap-3">
			<Tooltip.Root>
				<Tooltip.Trigger>
					{#snippet child({ props })}
						<Button
							{...props}
							href={resolve(`/complexes/${complexId}`)}
							variant="outline"
							size="icon-sm"
							aria-label={$LL.common.ui.previous()}
							class="border-border/60 bg-background/70 shadow-sm backdrop-blur-sm"
						>
							<ArrowLeftIcon class="size-4 rtl:rotate-180" />
							<span class="sr-only">{$LL.common.ui.previous()}</span>
						</Button>
					{/snippet}
				</Tooltip.Trigger>
				<Tooltip.Content side="top" sideOffset={8}>{$LL.common.ui.previous()}</Tooltip.Content>
			</Tooltip.Root>
			<div class="min-w-0 space-y-1">
				<p class="text-xs tracking-[0.2em] text-muted-foreground uppercase">
					{$LL.common.nav.complexes()}
				</p>
				<h1 class="text-base font-semibold tracking-tight">{$LL.complexes.units.management()}</h1>
			</div>
		</div>
	</div>

	<UnitsDataView {complexId} />
</div>
