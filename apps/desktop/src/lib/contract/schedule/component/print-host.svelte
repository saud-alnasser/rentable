<script lang="ts">
	import type { ContractActRecord } from '$lib/contract/acts';
	import { contractHostState } from '$lib/contract/host.svelte';
	import { useReadContractSchedule } from '$lib/contract/schedule/query';
	import { showErrorSentence, showErrorToast, showSuccessToast } from '$lib/notification';
	import { LL, locale } from '$lib/i18n/i18n-svelte';
	import type { Locales } from '$lib/i18n/i18n-types';
	import { i18nObject } from '$lib/i18n/i18n-util';
	import { PrintPreview } from '$lib/print/ui';
	import { sendPage, surfacesSettled } from '$lib/print/sheet.svelte';
	import { useReadOrganizationMark, useReadOrganizationName } from '$lib/organization/query';
	import { useReadTenant } from '$lib/tenant/query';
	import { memberPermissions } from '$lib/permission';
	import { untrack } from 'svelte';
	import PrintedSchedule, { type PrintedScheduleValue } from './printed-schedule.svelte';

	/**
	 * The printed schedule a contract's *print* act opens, answered once for the whole shell by the
	 * contract host that mounts it (`contract/component/host.svelte`): the request is raised on
	 * `contract/host.svelte.ts`, read here, previewed, and sent to paper or a PDF.
	 */

	const readTenant = useReadTenant();
	const readSchedule = useReadContractSchedule();
	// the organization, which is who keeps the schedule (effort 835, requirement 13).
	const readOrganizationName = useReadOrganizationName();
	const readOrganizationMark = useReadOrganizationMark();

	/**
	 * the schedule being previewed, the language it is shown in, and whether it is on its way to
	 * paper or a file. Raw, because a schedule is only ever replaced.
	 */
	let schedule = $state.raw<PrintedScheduleValue | null>(null);
	let scheduleOpen = $state(false);
	let scheduleLocale = $state<Locales>('en');
	let sending = $state(false);

	/**
	 * A contract's schedule, shown first in the application's own preview: its cycles, its tenant,
	 * its units and who keeps it are read afresh, and the preview opens on the language the
	 * application shows.
	 *
	 * The tenant and the units are read only for a reader who may view them, and the page leaves
	 * each out otherwise (effort 838, requirement 10); the complex holding a unit is left out by the
	 * read itself.
	 */
	async function previewSchedule(contract: ContractActRecord) {
		const viewsTenant = memberPermissions.views('tenant');
		const viewsUnit = memberPermissions.views('unit');

		try {
			const [cycles, units, tenant, issuer, mark] = await Promise.all([
				readSchedule.cycles(contract.id),
				viewsUnit ? readSchedule.units(contract.id) : undefined,
				viewsTenant ? readTenant(contract.tenantId).catch(() => undefined) : undefined,
				readOrganizationName(),
				// a mark that cannot be read leaves the foot empty rather than the schedule unprinted.
				readOrganizationMark().catch(() => null)
			]);

			schedule = {
				issuer,
				mark,
				contract,
				...(viewsTenant
					? {
							tenant: {
								name:
									tenant?.name?.trim() || contract.tenantName?.trim() || $LL.common.labels.tenant()
							}
						}
					: {}),
				...(units ? { units } : {}),
				cycles
			};
			scheduleLocale = $locale;
			scheduleOpen = true;
		} catch (error) {
			showErrorToast(error, $LL);
		}
	}

	/** The previewed schedule, in the language chosen, to paper or to a PDF. */
	async function sendSchedule(mode: 'print' | 'pdf') {
		if (!schedule || sending) {
			return;
		}

		sending = true;

		try {
			const title = i18nObject(scheduleLocale).contracts.schedule.printTitle();
			const name = schedule.contract.govId.trim();
			// the preview is closed, and gone, before the page is laid out for paper.
			const outcome = await sendPage(
				printedSchedule,
				mode,
				`${title}${name ? ` ${name}` : ''}.pdf`,
				async () => {
					scheduleOpen = false;
					await surfacesSettled();
				}
			);

			if (outcome === 'saved') {
				showSuccessToast($LL.print.saved());
			}
		} catch {
			showErrorSentence($LL.print.failed());
		} finally {
			sending = false;
		}
	}

	// the request is answered once and cleared first, as every request the contract host answers is.
	$effect(() => {
		const contract = contractHostState.printing;

		if (!contract) {
			return;
		}

		contractHostState.printing = null;
		untrack(() => void previewSchedule(contract));
	});
</script>

{#snippet printedSchedule()}
	{#if schedule}
		<PrintedSchedule value={schedule} locale={scheduleLocale} />
	{/if}
{/snippet}

{#snippet schedulePage(pageLocale: Locales)}
	{#if schedule}
		<PrintedSchedule value={schedule} locale={pageLocale} />
	{/if}
{/snippet}

<PrintPreview
	open={scheduleOpen}
	onOpenChange={(isOpen) => {
		if (!isOpen) scheduleOpen = false;
	}}
	title={$LL.contracts.schedule.print()}
	bind:locale={scheduleLocale}
	page={schedulePage}
	busy={sending}
	onSave={() => void sendSchedule('pdf')}
	onPrint={() => void sendSchedule('print')}
/>
