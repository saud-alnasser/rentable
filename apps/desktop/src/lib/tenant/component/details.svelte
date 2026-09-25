<script lang="ts">
	import { resolve } from '$app/paths';
	import RecordSurface from '@rentable/design/block/record-surface.svelte';
	import Specification from '@rentable/design/block/specification.svelte';
	import * as Cell from '$lib/design/cell';
	import RecordActionControl from '@rentable/design/block/record-action-control.svelte';
	import { toPageActions } from '$lib/design/acts';
	import { LL } from '$lib/i18n/i18n-svelte';
	import { isRecordId } from '$lib/platform/database/identity';
	import { tenantActs } from '$lib/tenant/host.svelte';
	import { useFetchTenant } from '$lib/tenant/query';
	import TenantContracts from './contracts.svelte';

	let { tenantId }: { tenantId: string } = $props();

	const tenantQuery = useFetchTenant(() => ({
		id: isRecordId(tenantId) ? tenantId : undefined,
		enabled: isRecordId(tenantId)
	}));
	const tenant = $derived(tenantQuery.data);

	// the page's cluster is a projection of the one list the card and the command menu read, so it
	// offers what they offer, in their order and under their names. What each act opens is the
	// tenant host's, mounted once in the frame, so this page mounts no form and no dialog.
	const pageActions = $derived(tenant ? toPageActions(tenantActs, tenant, $LL) : []);
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

{#snippet contracts()}
	<TenantContracts {tenantId} />
{/snippet}

<RecordSurface
	isLoading={tenantQuery.isLoading}
	found={Boolean(tenant)}
	backFallback={resolve('/tenants')}
	path={resolve(`/tenants/${tenantId}`)}
	eyebrow={$LL.common.nav.tenants()}
	title={tenant?.name ?? ''}
	{actions}
	{fields}
	collections={[{ value: 'contracts', label: $LL.common.nav.contracts(), content: contracts }]}
/>
