<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { back } from '@rentable/design/back.svelte.js';
	import DeleteDialog from '@rentable/design/block/delete-dialog.svelte';
	import { AWAITING_BLOCKERS } from '@rentable/design/confirmation.js';
	import { usesAppleKeyboard } from '@rentable/design/shortcut.js';
	import { useListContracts } from '$lib/contract/query';
	import { toPaletteVerbs } from '$lib/design/acts';
	import { onMutationError, onMutationSuccess } from '$lib/design/mutation';
	import { showErrorSentence, showErrorToast } from '$lib/error/toast';
	import { LL } from '$lib/i18n/i18n-svelte';
	import { writeDetailsToClipboard } from '$lib/platform/clipboard';
	import type { TenantActRecord } from '$lib/tenant/acts';
	import {
		closeTenantConfirmation,
		closeTenantForm,
		resetTenantHost,
		tenantActs,
		tenantHostState
	} from '$lib/tenant/host.svelte';
	import { useDeleteTenant, useReadTenant } from '$lib/tenant/query';
	import { isTenantDeletable } from '$lib/tenant/tenant';
	import { onDestroy, untrack } from 'svelte';
	import TenantForm from './form.svelte';

	/**
	 * The tenant form and the tenant's delete confirmation, mounted once for the whole shell.
	 *
	 * A tenant's acts are one list (`tenant/acts.ts`), and every surface offering them is a
	 * projection of it; what those acts open is here, so there is one `TenantForm` in the tree.
	 * `tenant/host.svelte.ts` is the request the surfaces raise and this answers, the way
	 * `contract/component/host.svelte` answers the contract's.
	 *
	 * **The mutation is here**, inside the providers, so it reads the query client from context the
	 * way every other hook does. What it writes, and how it is taken back, is unchanged from when
	 * each surface mounted its own copy.
	 */

	const deleteMutation = useDeleteTenant();
	const readTenant = useReadTenant();

	const deleting = $derived(tenantHostState.deleting);

	// what a deletion would be refused for, read for the record being acted on and only while it is
	// being acted on.
	const heldContractsQuery = useListContracts(
		() => '',
		() => null,
		() => ({ tenantId: deleting?.id }),
		() => deleting !== null
	);
	const deleteBlockers = $derived.by(() => {
		if (!deleting) {
			return [];
		}

		// the list query hands back the previous scope's rows while the new scope loads, so a second
		// tenant would otherwise be judged on what the first one held.
		if (heldContractsQuery.isPending || heldContractsQuery.isPlaceholderData) {
			return AWAITING_BLOCKERS;
		}

		const held = heldContractsQuery.data ?? [];

		return isTenantDeletable(held)
			? []
			: [$LL.common.deleteDialog.blockedContracts({ count: held.length })];
	});

	async function deleteConfirmed() {
		if (!deleting) {
			return;
		}

		const id = deleting.id;

		await deleteMutation.mutateAsync(id);
		closeTenantConfirmation();

		const recordPage = resolve(`/tenants/${id}`);

		// the tenant's own page is not somewhere back can return to now that the record is gone.
		// Where the reader is standing on it, they are taken to the directory; anywhere else, the
		// page is only forgotten from behind them.
		if (page.url.pathname === recordPage) {
			back.forgetCurrent();
			await goto(resolve('/tenants'));

			return;
		}

		back.forget(recordPage);
	}

	/** A tenant's stated details on the clipboard, in the order its page reads them. */
	async function copyDetails(tenant: TenantActRecord) {
		const copied = await writeDetailsToClipboard([
			{ label: $LL.common.labels.name(), value: tenant.name },
			{ label: $LL.common.labels.nationalId(), value: tenant.nationalId },
			{ label: $LL.common.labels.phone(), value: tenant.phone }
		]);

		if (copied) {
			onMutationSuccess({ toast: { success: () => $LL.common.messages.copied() } });

			return;
		}

		onMutationError(
			{ toast: { unexpected: () => $LL.common.messages.copyFailed() } },
			new Error('the clipboard refused')
		);
	}

	/**
	 * An act named by a tenant's identity: read the tenant, then answer on the terms the command
	 * menu's own projection gives for it.
	 */
	async function answerAsked(actId: string, tenantId: string) {
		let tenant: TenantActRecord | undefined;

		try {
			tenant = await readTenant(tenantId);
		} catch (error) {
			showErrorToast(error, $LL);

			return;
		}

		if (!tenant) {
			showErrorSentence($LL.common.errors.notFound());

			return;
		}

		const verb = toPaletteVerbs(tenantActs, tenant, $LL, usesAppleKeyboard()).find(
			(offered) => offered.id === actId
		);

		if (!verb) {
			const act = tenantActs.find((declared) => declared.id === actId);

			showErrorSentence(
				$LL.common.ui.commandPaletteActDoesNotApply({
					act: act?.label($LL) ?? actId,
					record: tenant.name.trim() || $LL.common.labels.tenant()
				})
			);

			return;
		}

		if (verb.unavailable) {
			showErrorSentence(verb.unavailable);

			return;
		}

		verb.run();
	}

	// both requests are answered once and cleared first, so an answer that takes a read cannot be
	// asked twice by the effect running again while it waits.
	$effect(() => {
		const tenant = tenantHostState.copying;

		if (!tenant) {
			return;
		}

		tenantHostState.copying = null;
		untrack(() => void copyDetails(tenant));
	});

	$effect(() => {
		const asked = tenantHostState.asked;

		if (!asked) {
			return;
		}

		tenantHostState.asked = null;
		untrack(() => void answerAsked(asked.actId, asked.tenantId));
	});

	onDestroy(resetTenantHost);
</script>

{#key tenantHostState.form.key}
	<TenantForm
		open={tenantHostState.form.open}
		onOpenChange={(isOpen) => {
			if (!isOpen) {
				closeTenantForm();
			}
		}}
		value={tenantHostState.form.value}
	/>
{/key}

<DeleteDialog
	open={deleting !== null}
	onOpenChange={(isOpen) => {
		if (!isOpen) {
			closeTenantConfirmation();
		}
	}}
	record={deleting?.name}
	blockers={deleteBlockers}
	onSubmit={deleteConfirmed}
/>
