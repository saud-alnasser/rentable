<script lang="ts">
	import api from '$lib/api/caller';
	import { Card, CardContent } from '$lib/design/primitive/card';
	import { Spinner } from '$lib/design/primitive/spinner';
	import { useFetchContractDashboard } from '$lib/dashboard/query';
	import { LL } from '$lib/i18n/i18n-svelte';
	import DashboardEndingSoonSection from '$lib/dashboard/component/ending-soon-section.svelte';
	import DashboardFollowUpsSection from '$lib/dashboard/component/follow-ups-section.svelte';
	import DashboardHeader from '$lib/dashboard/component/header.svelte';
	import DashboardSummaryGrid from '$lib/dashboard/component/summary-grid.svelte';

	type DashboardData = Awaited<ReturnType<typeof api.contract.dashboard>>;

	const dashboardQuery = useFetchContractDashboard();
	let dashboardData = $derived<DashboardData | undefined>(dashboardQuery.data);
</script>

{#if dashboardQuery.isLoading}
	<div class="flex min-h-full flex-1 items-center justify-center p-1">
		<div class="flex flex-col items-center gap-3">
			<Spinner class="size-8 text-muted-foreground" />
			<p class="text-sm text-muted-foreground">{$LL.common.messages.loadingDashboard()}</p>
		</div>
	</div>
{:else}
	<div class="mx-auto flex w-full max-w-7xl flex-col gap-5 px-5 pt-5 pb-8">
		<DashboardHeader generatedAt={dashboardData?.generatedAt} />

		{#if dashboardData}
			<DashboardSummaryGrid data={dashboardData} />
			<div class="grid gap-3 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
				<DashboardFollowUpsSection data={dashboardData} />
				<DashboardEndingSoonSection data={dashboardData} />
			</div>
		{:else}
			<Card>
				<CardContent class="pt-6">
					<p class="text-sm text-muted-foreground">{$LL.dashboard.followUps.unavailable()}</p>
				</CardContent>
			</Card>
		{/if}
	</div>
{/if}
