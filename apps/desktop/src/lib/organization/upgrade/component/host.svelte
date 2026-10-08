<script lang="ts">
	import { LL } from '$lib/i18n/i18n-svelte';
	import { toRefusalText } from '$lib/error/refusal';
	import { useFetchOrganizationState } from '$lib/organization/query';
	import { useFetchUpgradePreview, useRunUpgrade } from '$lib/organization/upgrade/query';
	import { closeUpgrade, upgradeSheet } from '$lib/organization/upgrade/sheet.svelte';
	import { onDestroy } from 'svelte';
	import UpgradeSheet from './sheet.svelte';

	/**
	 * The upgrade sheet, mounted once for the whole shell beside the organization's other surfaces
	 * (`../../component/host.svelte`), and opened from the organization's card and from a
	 * workspace's card's menu through `../sheet.svelte.ts` (effort 857, ticket 08).
	 *
	 * **It reads what the upgrade would do while it is open**, afresh each time, and runs it through
	 * the run's mutation, which reports as every write to the organization does: a landed run
	 * closes the sheet, a refused one leaves it open with its sentence said by the shared handler.
	 *
	 * **Who may not run it is told at upgrade now**: a preview the shell refused, such as before
	 * the owner has opened this version, and a step needing the owner's own key, met by anybody
	 * else. Rust refuses both again.
	 */
	const stateQuery = useFetchOrganizationState();
	const session = $derived(stateQuery.data?.session ?? null);

	const previewQuery = useFetchUpgradePreview(() => upgradeSheet.target);
	const run = useRunUpgrade();

	let running = $state(false);

	const refusal = $derived.by(() => {
		if (previewQuery.error) return toRefusalText(previewQuery.error, $LL);

		if (previewQuery.data?.needsOwner && session?.role !== 'owner') {
			return $LL.common.refusals.host.upgradeNeedsOwner();
		}

		return null;
	});

	async function upgrade() {
		const target = upgradeSheet.target;

		if (!target || running) return;

		running = true;

		try {
			await run.mutateAsync({ target, name: upgradeSheet.name });
			closeUpgrade();
		} catch {
			// said by the shared handler; the sheet stays open on what it showed.
		} finally {
			running = false;
		}
	}

	onDestroy(closeUpgrade);
</script>

{#if upgradeSheet.target !== null}
	<UpgradeSheet
		open
		onOpenChange={(open) => {
			if (!open && !running) closeUpgrade();
		}}
		target={upgradeSheet.target}
		name={upgradeSheet.name}
		preview={previewQuery.data}
		{refusal}
		{running}
		onUpgrade={() => void upgrade()}
	/>
{/if}
