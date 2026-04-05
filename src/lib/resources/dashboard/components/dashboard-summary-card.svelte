<script lang="ts">
	import {
		Card,
		CardContent,
		CardDescription,
		CardHeader,
		CardTitle
	} from '$lib/common/components/fragments/card';
	import { cn } from '$lib/common/utils/tailwind.js';

	let {
		section
	}: {
		section: {
			title: string;
			description: string;
			heroLabel: string;
			heroValue: string;
			heroHint: string;
			heroClass: string;
			stats: { id: string; label: string; value: string }[];
		};
	} = $props();

	const dashboardCardClass = 'border-border/70 bg-card/65 shadow-xl backdrop-blur-xl';
	const dashboardSubtlePanelClass =
		'rounded-xl border border-primary/10 bg-accent/35 p-3 text-start backdrop-blur-sm';
</script>

<Card class={cn('gap-4 overflow-hidden', dashboardCardClass)}>
	<CardHeader class="gap-3 border-b border-border/50 pb-5">
		<CardTitle class="capitalize">{section.title}</CardTitle>
		<CardDescription>{section.description}</CardDescription>
	</CardHeader>
	<CardContent class="space-y-4 pt-5">
		<div class={cn('rounded-2xl border border-border/60 p-4 shadow-sm', section.heroClass)}>
			<p class="text-xs font-medium tracking-[0.18em] text-muted-foreground uppercase">
				{section.heroLabel}
			</p>
			<div class="mt-3 flex flex-wrap items-end justify-between gap-3 rtl:flex-row-reverse">
				<p class="text-start text-3xl font-semibold tracking-tight">{section.heroValue}</p>
				<p class="max-w-[16rem] text-sm text-muted-foreground">{section.heroHint}</p>
			</div>
		</div>

		<div class="grid gap-3 sm:grid-cols-2 [&>*]:text-start">
			{#each section.stats as stat (stat.id)}
				<div class={dashboardSubtlePanelClass}>
					<p class="text-xs tracking-wide text-muted-foreground uppercase">{stat.label}</p>
					<p class="mt-1 text-base font-semibold">{stat.value}</p>
				</div>
			{/each}
		</div>
	</CardContent>
</Card>
