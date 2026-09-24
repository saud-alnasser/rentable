<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { back } from '@rentable/design/back.svelte.js';
	import DeleteDialog from '@rentable/design/block/delete-dialog.svelte';
	import { AWAITING_BLOCKERS } from '@rentable/design/confirmation.js';
	import { usesAppleKeyboard } from '@rentable/design/shortcut.js';
	import type { ComplexActRecord } from '$lib/complex/acts';
	import { isComplexDeletable } from '$lib/complex/complex';
	import {
		closeComplexConfirmation,
		closeComplexForm,
		complexActs,
		complexHostState,
		resetComplexHost
	} from '$lib/complex/host.svelte';
	import { useDeleteComplex, useFetchUnits, useReadComplex } from '$lib/complex/query';
	import { toPaletteVerbs } from '$lib/design/acts';
	import { onMutationError, onMutationSuccess } from '$lib/design/mutation';
	import { showErrorSentence, showErrorToast } from '$lib/error/toast';
	import { LL } from '$lib/i18n/i18n-svelte';
	import { writeDetailsToClipboard } from '$lib/platform/clipboard';
	import { onDestroy, untrack } from 'svelte';
	import ComplexForm from './form.svelte';

	/**
	 * The complex form and the complex's delete confirmation, mounted once for the whole shell.
	 *
	 * A complex's acts are one list (`complex/acts.ts`), and every surface offering them is a
	 * projection of it; what those acts open is here, so there is one `ComplexForm` in the tree.
	 * `complex/host.svelte.ts` is the request the surfaces raise and this answers, the way
	 * `contract/component/host.svelte` answers the contract's.
	 *
	 * **The mutation is here**, inside the providers, so it reads the query client from context the
	 * way every other hook does. What it writes, and how it is taken back, is unchanged from when
	 * each surface mounted its own copy.
	 */

	const deleteMutation = useDeleteComplex();
	const readComplex = useReadComplex();

	const deleting = $derived(complexHostState.deleting);

	// what a deletion would be refused for, read for the record being acted on and only while it is
	// being acted on. The rule is the domain's to apply, on the units themselves rather than on a
	// figure a row carries.
	const heldUnitsQuery = useFetchUnits(
		() => deleting?.id ?? '',
		() => deleting !== null
	);
	const deleteBlockers = $derived.by(() => {
		if (!deleting) {
			return [];
		}

		if (heldUnitsQuery.isPending) {
			return AWAITING_BLOCKERS;
		}

		const held = heldUnitsQuery.data ?? [];

		return isComplexDeletable(held)
			? []
			: [$LL.common.deleteDialog.blockedUnits({ count: held.length })];
	});

	async function deleteConfirmed() {
		if (!deleting) {
			return;
		}

		const id = deleting.id;

		await deleteMutation.mutateAsync(id);
		closeComplexConfirmation();

		const recordPage = resolve(`/complexes/${id}`);

		// the complex's own page is not somewhere back can return to now that the record is gone.
		// Where the reader is standing on it, they are taken to the directory; anywhere else, the
		// page is only forgotten from behind them.
		if (page.url.pathname === recordPage) {
			back.forgetCurrent();
			await goto(resolve('/complexes'));

			return;
		}

		back.forget(recordPage);
	}

	/** A complex's stated details on the clipboard, in the order its page reads them. */
	async function copyDetails(complex: ComplexActRecord) {
		const copied = await writeDetailsToClipboard([
			{ label: $LL.common.labels.name(), value: complex.name },
			{ label: $LL.common.labels.location(), value: complex.location }
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
	 * An act named by a complex's identity: read the complex, then answer on the terms the command
	 * menu's own projection gives for it.
	 */
	async function answerAsked(actId: string, complexId: string) {
		let complex: ComplexActRecord | undefined;

		try {
			complex = await readComplex(complexId);
		} catch (error) {
			showErrorToast(error, $LL);

			return;
		}

		if (!complex) {
			showErrorSentence($LL.common.errors.notFound());

			return;
		}

		const verb = toPaletteVerbs(complexActs, complex, $LL, usesAppleKeyboard()).find(
			(offered) => offered.id === actId
		);

		if (!verb) {
			const act = complexActs.find((declared) => declared.id === actId);

			showErrorSentence(
				$LL.common.ui.commandPaletteActDoesNotApply({
					act: act?.label($LL) ?? actId,
					record: complex.name.trim() || $LL.common.labels.complex()
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
		const complex = complexHostState.copying;

		if (!complex) {
			return;
		}

		complexHostState.copying = null;
		untrack(() => void copyDetails(complex));
	});

	$effect(() => {
		const asked = complexHostState.asked;

		if (!asked) {
			return;
		}

		complexHostState.asked = null;
		untrack(() => void answerAsked(asked.actId, asked.complexId));
	});

	onDestroy(resetComplexHost);
</script>

{#key complexHostState.form.key}
	<ComplexForm
		open={complexHostState.form.open}
		onOpenChange={(isOpen) => {
			if (!isOpen) {
				closeComplexForm();
			}
		}}
		value={complexHostState.form.value}
	/>
{/key}

<DeleteDialog
	open={deleting !== null}
	onOpenChange={(isOpen) => {
		if (!isOpen) {
			closeComplexConfirmation();
		}
	}}
	record={deleting?.name}
	blockers={deleteBlockers}
	onSubmit={deleteConfirmed}
/>
