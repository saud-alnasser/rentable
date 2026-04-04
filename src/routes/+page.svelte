<script lang="ts">
	import api from '$lib/api/mod';
	import { Card, CardContent } from '$lib/common/components/fragments/card';
	import { Spinner } from '$lib/common/components/fragments/spinner';
	import { LL } from '$lib/i18n/i18n-svelte';
	import { useFetchContractDashboard } from '$lib/resources/contracts/hooks/queries';
	import DashboardEndingSoonSection from '$lib/resources/dashboard/components/dashboard-ending-soon-section.svelte';
	import DashboardFollowUpsSection from '$lib/resources/dashboard/components/dashboard-follow-ups-section.svelte';
	import DashboardHeader from '$lib/resources/dashboard/components/dashboard-header.svelte';
	import DashboardSummaryGrid from '$lib/resources/dashboard/components/dashboard-summary-grid.svelte';

	type DashboardData = Awaited<ReturnType<typeof api.contract.dashboard>>;

	const dashboardQuery = useFetchContractDashboard();
	const dashboardCardClass = 'border-border/70 bg-card/65 shadow-xl backdrop-blur-xl';
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
	<div class="flex flex-col gap-5 p-1">
		<DashboardHeader generatedAt={dashboardData?.generatedAt} />

		{#if dashboardData}
			<DashboardSummaryGrid data={dashboardData} />
			<DashboardFollowUpsSection data={dashboardData} />
			<DashboardEndingSoonSection data={dashboardData} />
		{:else}
			<Card class={dashboardCardClass}>
				<CardContent class="pt-6">
					<p class="text-sm text-muted-foreground">{$LL.dashboard.followUps.unavailable()}</p>
				</CardContent>
			</Card>
		{/if}
	</div>
{/if}
