<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { back } from '@rentable/design/back.svelte.js';
	import DeleteDialog from '@rentable/design/block/delete-dialog.svelte';
	import { AWAITING_BLOCKERS } from '@rentable/design/confirmation.js';
	import { usesAppleKeyboard } from '@rentable/design/shortcut.js';
	import { isUnitDeletable } from '$lib/complex/complex';
	import { useDeleteUnit, useReadUnit } from '$lib/complex/query';
	import type { UnitActRecord } from '$lib/complex/unit/acts';
	import {
		closeUnitConfirmation,
		closeUnitForm,
		resetUnitHost,
		unitActs,
		unitHostState
	} from '$lib/complex/unit/host.svelte';
	import { useListContracts } from '$lib/contract/query';
	import { toDeleteStep, toPaletteVerbs } from '$lib/design/acts';
	import { onMutationError, onMutationSuccess } from '$lib/design/mutation';
	import { showErrorSentence, showErrorToast, showRefusal } from '$lib/error/toast';
	import { LL } from '$lib/i18n/i18n-svelte';
	import { writeDetailsToClipboard } from '$lib/platform/clipboard';
	import { onDestroy, untrack } from 'svelte';
	import UnitForm from './form.svelte';

	/**
	 * The unit form and the unit's delete, mounted once for the whole shell. A delete runs at once
	 * and offers undo, as its act declares; the dialog is drawn only where something refuses it, to
	 * say what ([[rules/interface]], *Delete and confirm*).
	 *
	 * A unit's acts are one list (`complex/unit/acts.ts`), and every surface offering them is a
	 * projection of it; what those acts open is here, so there is one `UnitForm` in the tree and a
	 * unit's own page offers what its card offers. `complex/unit/host.svelte.ts` is the request the
	 * surfaces raise and this answers, the way `contract/component/host.svelte` answers the
	 * contract's.
	 *
	 * **The mutation is here**, inside the providers, so it reads the query client from context the
	 * way every other hook does. What it writes, and how it is taken back, is unchanged from when
	 * the unit directory mounted its own copy.
	 */

	const deleteMutation = useDeleteUnit();
	const readUnit = useReadUnit();

	const deleting = $derived(unitHostState.deleting);

	// what a deletion would be refused for, read for the record being acted on and only while it is
	// being acted on: every contract that ever named the unit, not only the one holding it today.
	const holdingContractsQuery = useListContracts(
		() => '',
		() => null,
		() => ({ unitId: deleting?.id }),
		() => deleting !== null
	);
	const deleteBlockers = $derived.by(() => {
		if (!deleting) {
			return [];
		}

		// the list query hands back the previous scope's rows while the new scope loads, so a second
		// unit would otherwise be judged on what the first one held.
		if (holdingContractsQuery.isPending || holdingContractsQuery.isPlaceholderData) {
			return AWAITING_BLOCKERS;
		}

		const held = holdingContractsQuery.data ?? [];

		return isUnitDeletable(held)
			? []
			: [$LL.common.deleteDialog.blockedContracts({ count: held.length })];
	});

	// whether the delete asks, waits on what refuses it, or runs now, by the act's own policy.
	const deletePolicy = unitActs.find((act) => act.id === 'unit.delete')?.confirmation;
	const deleteStep = $derived(deleting ? toDeleteStep(deletePolicy, deleteBlockers) : 'wait');

	async function deleteConfirmed() {
		if (!deleting) {
			return;
		}

		const { id, complexId } = deleting;

		await deleteMutation.mutateAsync(id);
		closeUnitConfirmation();
		await leaveDeleted(id, complexId);
	}

	/** A delete nothing asked about: its refusal, where it earns one, is raised rather than held. */
	async function deleteAtOnce(id: string, complexId: string) {
		try {
			await deleteMutation.mutateAsync(id);
		} catch (error) {
			showRefusal(error, $LL);

			return;
		}

		await leaveDeleted(id, complexId);
	}

	async function leaveDeleted(id: string, complexId: string) {
		const recordPage = resolve(`/complexes/units/${id}`);

		// the unit's own page is not somewhere back can return to now that the record is gone. Where
		// the reader is standing on it, they are taken to the complex that held it; anywhere else,
		// the page is only forgotten from behind them.
		if (page.url.pathname === recordPage) {
			back.forgetCurrent();
			await goto(resolve(`/complexes/${complexId}`));

			return;
		}

		back.forget(recordPage);
	}

	/**
	 * A unit's stated details on the clipboard, in the order its page reads them, the same from a
	 * card as from the page: the unit is read for the complex's name and its status today where the
	 * record handed over is a row short of them.
	 */
	async function copyDetails(unit: UnitActRecord) {
		const read = await readUnit(unit.id).catch(() => undefined);
		const status = read?.status ?? unit.status;
		// the complex only where a read answered with it (effort 838, requirement 10).
		const complexName = read?.complexName ?? unit.complexName;

		const copied = await writeDetailsToClipboard([
			{ label: $LL.common.labels.name(), value: read?.name ?? unit.name },
			...(complexName !== undefined
				? [{ label: $LL.common.labels.complex(), value: complexName }]
				: []),
			{ label: $LL.common.labels.status(), value: $LL.common.status[status]() }
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
	 * An act named by a unit's identity: read the unit, then answer on the terms the command menu's
	 * own projection gives for it.
	 */
	async function answerAsked(actId: string, unitId: string) {
		let unit: UnitActRecord | undefined;

		try {
			unit = await readUnit(unitId);
		} catch (error) {
			showErrorToast(error, $LL);

			return;
		}

		if (!unit) {
			showErrorSentence($LL.common.errors.notFound());

			return;
		}

		const verb = toPaletteVerbs(unitActs, unit, $LL, usesAppleKeyboard()).find(
			(offered) => offered.id === actId
		);

		if (!verb) {
			const act = unitActs.find((declared) => declared.id === actId);

			showErrorSentence(
				$LL.common.ui.commandPaletteActDoesNotApply({
					act: act?.label($LL) ?? actId,
					record: unit.name.trim() || $LL.common.labels.unit()
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
		const unit = unitHostState.copying;

		if (!unit) {
			return;
		}

		unitHostState.copying = null;
		untrack(() => void copyDetails(unit));
	});

	$effect(() => {
		const asked = unitHostState.asked;

		if (!asked) {
			return;
		}

		unitHostState.asked = null;
		untrack(() => void answerAsked(asked.actId, asked.unitId));
	});

	// the request is answered once and cleared first, as the two above are.
	$effect(() => {
		if (deleteStep !== 'run' || !deleting) {
			return;
		}

		const { id, complexId } = deleting;

		closeUnitConfirmation();
		untrack(() => void deleteAtOnce(id, complexId));
	});

	onDestroy(resetUnitHost);
</script>

<!-- mounted once a complex has been named: the form reads the units that complex already holds,
     and a form with no complex has nothing it could write to. -->
{#if unitHostState.form.complexId}
	{#key unitHostState.form.key}
		<UnitForm
			open={unitHostState.form.open}
			onOpenChange={(isOpen) => {
				if (!isOpen) {
					closeUnitForm();
				}
			}}
			value={unitHostState.form.value}
			complexId={unitHostState.form.complexId}
		/>
	{/key}
{/if}

<DeleteDialog
	open={deleting !== null && deleteStep === 'ask'}
	onOpenChange={(isOpen) => {
		if (!isOpen) {
			closeUnitConfirmation();
		}
	}}
	record={deleting?.name}
	blockers={deleteBlockers}
	onSubmit={deleteConfirmed}
/>
