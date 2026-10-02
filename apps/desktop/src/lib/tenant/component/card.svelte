<script lang="ts" module>
	import type api from '$lib/api/caller';
	import type { Contract } from '$lib/platform/database/schema';

	export type TenantRecord = Awaited<ReturnType<typeof api.tenant.getMany>>[number];

	/** the statuses a tenant's contracts are counted in: every status a contract can hold. */
	type ContractStatus = Contract['status'];

	/**
	 * The height a tenant's tile is laid at, which the list reads rather than measuring the tile.
	 *
	 * Measured on the development workspace in both locales (effort 846, the cards on real data):
	 * the padding, the heading line at the control's height, then three lines at the facts' fixed
	 * 20 px leading, four pixels apart. It holds only because every line sets that leading, so a
	 * line added to the tile, or one drawn without it, changes this figure too.
	 */
	export const TENANT_TILE_HEIGHT = 144;

	/**
	 * The tenant's six counts, keyed by the status each counts.
	 *
	 * The query answers with one field per status rather than a nested figure, so this is where
	 * the two shapes meet. Nothing where the record carries no counts: a reader who may not view
	 * contracts is answered with none (effort 838, requirement 10), and the card then says nothing
	 * of contracts rather than claiming there are none.
	 */
	export const contractCounts = (
		tenant: TenantRecord
	): Record<ContractStatus, number> | undefined =>
		tenant.contractsScheduled === undefined
			? undefined
			: {
					scheduled: tenant.contractsScheduled,
					active: tenant.contractsActive ?? 0,
					fulfilled: tenant.contractsFulfilled ?? 0,
					defaulted: tenant.contractsDefaulted ?? 0,
					expired: tenant.contractsExpired ?? 0,
					terminated: tenant.contractsTerminated ?? 0
				};
</script>

<script lang="ts">
	import { resolve } from '$app/paths';
	import RecordCard, { type RecordCardAction } from '@rentable/design/block/record-card.svelte';
	import * as Cell from '$lib/design/cell';
	import { factLeading } from '$lib/design/cell/fact.svelte';
	import { LL } from '$lib/i18n/i18n-svelte';
	import FileTextIcon from '@lucide/svelte/icons/file-text';
	import IdCardIcon from '@lucide/svelte/icons/id-card';
	import PhoneIcon from '@lucide/svelte/icons/phone';

	/**
	 * A tenant, as the tenants directory lays one in its grid: the name, the two facts a reader
	 * finds a tenant by, and what the contracts naming the tenant stand at.
	 *
	 * The name is the one strong line (_Size isn't everything_, 38). The national id and the phone
	 * follow, each with its glyph and held left to right, since a number reads that way in both
	 * locales. The contracts close the tile, pushed to its foot so the two facts above read as
	 * one group: a chip for each status holding any, its glyph, figure and word in the status's
	 * tone, or *no contracts* where every count is zero. A count of zero is not drawn, so a tenant
	 * with one active contract reads as exactly that and not as six figures, five of them nothing.
	 */
	let {
		tenant,
		actions,
		statuses
	}: {
		tenant: TenantRecord;
		/** what the tenant offers, on both of the card's routes. */
		actions: RecordCardAction[];
		/** the order the chips stand in: the contracts directory's, most in need of the reader first. */
		statuses: readonly ContractStatus[];
	} = $props();

	const counts = $derived(contractCounts(tenant));
	const held = $derived(counts ? statuses.filter((status) => counts[status] > 0) : []);
</script>

<RecordCard
	href={resolve(`/tenants/${tenant.id}`)}
	label={tenant.name}
	{actions}
	layout="tile"
	class="gap-1"
>
	{#snippet heading()}
		<Cell.Text class="truncate text-sm font-semibold" text={tenant.name} />
	{/snippet}

	{#snippet content()}
		<Cell.Fact icon={IdCardIcon} class="mt-1">
			<span dir="ltr" class="truncate tabular-nums">{tenant.nationalId}</span>
		</Cell.Fact>
		<Cell.Fact icon={PhoneIcon}>
			<Cell.Phone phone={tenant.phone} />
		</Cell.Fact>

		{#if counts}
			{#if held.length > 0}
				<span
					data-tenant-contracts
					class="pointer-events-none relative mt-auto flex min-w-0 items-center gap-3 overflow-hidden {factLeading}"
				>
					{#each held as status (status)}
						<Cell.StatusCount
							{status}
							count={counts[status]}
							label={$LL.tenants.card.contracts[status]({ count: counts[status] })}
						/>
					{/each}
				</span>
			{:else}
				<Cell.Fact icon={FileTextIcon} class="mt-auto">
					<span data-tenant-contracts class="truncate">{$LL.tenants.card.noContracts()}</span>
				</Cell.Fact>
			{/if}
		{/if}
	{/snippet}
</RecordCard>
