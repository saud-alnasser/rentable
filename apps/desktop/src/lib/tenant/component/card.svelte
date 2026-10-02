<script lang="ts" module>
	import type api from '$lib/api/caller';
	import type { Contract } from '$lib/platform/database/schema';

	export type TenantRecord = Awaited<ReturnType<typeof api.tenant.getMany>>[number];

	/** the statuses a tenant's contracts are counted in: every status a contract can hold. */
	type ContractStatus = Contract['status'];

	/**
	 * The height a tenant's tile is laid at, which the list reads rather than measuring the tile.
	 *
	 * Counted the way the member's tile is (effort 846, ticket 42): the padding (32), the heading
	 * line at the control's height (32), then 12 px to the fields, two rows of fields 8 px apart,
	 * each field 8 px of padding above and below a name and a value at a fixed 20 px leading
	 * (8 + 20 + 20 + 8 = 56). 32 + 32 + 12 + (56 + 8 + 56) = 196. The contracts row is counted
	 * whether or not it draws, so every tile in the directory stands at one height. It holds in
	 * Arabic only because every line sets its own leading, so a line added to the tile, or one
	 * drawn without it, changes this figure too.
	 */
	export const TENANT_TILE_HEIGHT = 196;

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
	import { LL } from '$lib/i18n/i18n-svelte';
	import FileTextIcon from '@lucide/svelte/icons/file-text';
	import IdCardIcon from '@lucide/svelte/icons/id-card';
	import PhoneIcon from '@lucide/svelte/icons/phone';

	/**
	 * A tenant, as the tenants directory lays one in its grid: the name, the two facts a reader
	 * finds a tenant by, and what the contracts naming the tenant stand at.
	 *
	 * **The heading is the name**, the one strong line (_Size isn't everything_, 38).
	 *
	 * **Then the fields, in the member card's family** (the human's word of 2026-10-03, "follow
	 * the tinted files and things like that in the reocrds cards of domain data"): each a softly
	 * tinted `Cell.Field`, its glyph and name small and muted over the value, in a grid two
	 * across. The national id and the phone fill the first row, each held left to right, since a
	 * number reads that way in both locales.
	 *
	 * **The contracts take the second row whole**, since a tenant's statuses are several short
	 * values on one line and half a row would cut the second of them. The value is a chip for
	 * each status holding any, its glyph, figure and word in the status's tone, or *no contracts*
	 * drawn muted where every count is zero (_Emphasize by de-emphasizing_, 46). A count of zero
	 * is not drawn, so a tenant with one active contract reads as exactly that and not as six
	 * figures, five of them nothing. A reader who may not view contracts gets no contracts field
	 * at all, rather than one claiming there are none.
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
	class="gap-3"
>
	{#snippet heading()}
		<Cell.Text class="truncate text-sm font-semibold" text={tenant.name} />
	{/snippet}

	{#snippet content()}
		<div data-tenant-fields class="pointer-events-none relative grid grid-cols-2 gap-2">
			<Cell.Field hook="tenant-field" icon={IdCardIcon} name={$LL.common.labels.nationalId()}>
				<span dir="ltr" data-tenant-national-id class="tabular-nums">{tenant.nationalId}</span>
			</Cell.Field>

			<Cell.Field hook="tenant-field" icon={PhoneIcon} name={$LL.common.labels.phone()}>
				<Cell.Phone phone={tenant.phone} />
			</Cell.Field>

			{#if counts}
				{#if held.length > 0}
					<Cell.Field
						hook="tenant-field"
						icon={FileTextIcon}
						name={$LL.tenants.card.contractsName()}
						class="col-span-2"
						valueAttributes={{ 'data-tenant-contracts': held.length }}
					>
						<span class="flex min-w-0 items-center gap-3 overflow-hidden">
							{#each held as status (status)}
								<Cell.StatusCount
									{status}
									count={counts[status]}
									label={$LL.tenants.card.contracts[status]({ count: counts[status] })}
								/>
							{/each}
						</span>
					</Cell.Field>
				{:else}
					<Cell.Field
						hook="tenant-field"
						icon={FileTextIcon}
						name={$LL.tenants.card.contractsName()}
						value={$LL.tenants.card.noContracts()}
						empty
						class="col-span-2"
						valueAttributes={{ 'data-tenant-contracts': 0 }}
					/>
				{/if}
			{/if}
		</div>
	{/snippet}
</RecordCard>
