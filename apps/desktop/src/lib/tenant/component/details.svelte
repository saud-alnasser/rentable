<script lang="ts">
	import { resolve } from '$app/paths';
	import { toReadFailure } from '$lib/error/read';
	import RecordSurface from '@rentable/design/block/record-surface.svelte';
	import Specification from '@rentable/design/block/specification.svelte';
	import * as Cell from '$lib/design/cell';
	import RecordActionControl from '@rentable/design/block/record-action-control.svelte';
	import { toPageActions } from '$lib/act';
	import type { Section } from '$lib/feature/surface';
	import { LL } from '$lib/i18n/i18n-svelte';
	import { isRecordId } from '$lib/platform/database/identity';
	import { tenantActs } from '$lib/tenant/host.svelte';
	import { useFetchTenant } from '$lib/tenant/query';

	let {
		tenantId,
		sections = []
	}: {
		tenantId: string;
		/** what other features contribute to a tenant's page, handed over by the route. */
		sections?: Section<'tenant'>[];
	} = $props();

	const tenantQuery = useFetchTenant(() => ({
		id: isRecordId(tenantId) ? tenantId : undefined,
		enabled: isRecordId(tenantId)
	}));
	const tenant = $derived(tenantQuery.data);
	// whether the read behind the page failed, as `$lib/error/read` decides it, and what runs it
	// again: the surface draws the failed state in place of *not found* while it did.
	const tenantRead = $derived(toReadFailure(tenantQuery));

	// the page's cluster is a projection of the one list the card and the command menu read, so it
	// offers what they offer, in their order and under their names. What each act opens is the
	// tenant host's, mounted once in the frame, so this page mounts no form and no dialog.
	const pageActions = $derived(tenant ? toPageActions(tenantActs, tenant, $LL) : []);

	// what hangs off a tenant is what other features contribute, a section the reader may not see
	// left out whole.
	const collections = $derived(
		sections
			.filter((section) => section.shows?.() ?? true)
			.map((section) => ({ value: section.value, label: section.label($LL), content: contributed }))
	);
</script>

{#snippet actions()}
	{#each pageActions as act (act.id)}
		<RecordActionControl
			label={act.label}
			icon={act.icon}
			tone={act.tone}
			shortcut={act.shortcut}
			unavailable={act.unavailable}
			onclick={act.run}
		/>
	{/each}
{/snippet}

{#snippet phone()}
	<Cell.Phone phone={tenant?.phone ?? ''} />
{/snippet}

<!-- both identifiers are labelled, and the phone number no longer reads unlabelled above the
     name. _Labels are a last resort_ ends by carving out this case: a label is wanted where
     several pieces of similar data have to be scannable, and two digit strings on one screen
     are exactly that — format tells a phone number from prose, not from a national id. -->
{#snippet fields()}
	<Specification
		entries={[
			{ label: $LL.common.labels.nationalId(), value: tenant?.nationalId ?? '' },
			{ label: $LL.common.labels.phone(), value: phone }
		]}
	/>
{/snippet}

{#snippet contributed(value: string)}
	{@const contribution = sections.find((section) => section.value === value)}
	{#if contribution}
		<contribution.component kind="tenant" recordId={tenantId} />
	{/if}
{/snippet}

<RecordSurface
	isLoading={tenantQuery.isLoading}
	failed={tenantRead.failed}
	onRetry={tenantRead.retry}
	found={Boolean(tenant)}
	backFallback={resolve('/tenants')}
	path={resolve(`/tenants/${tenantId}`)}
	eyebrow={$LL.common.nav.tenants()}
	title={tenant?.name ?? ''}
	{actions}
	{fields}
	{collections}
/>
