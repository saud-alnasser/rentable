<script lang="ts">
	import ContractForm from '$lib/contract/component/form.svelte';
	import { shortcuts } from '$lib/design/shortcut-registry.svelte';
	import type { RecordSubject } from '$lib/layout/palette';

	/**
	 * The actions the shell can run on a record the reader names, and what they need to be
	 * carried out.
	 *
	 * Renewal is here rather than only on the three surfaces that list a contract because it is
	 * the action a reader arrives with in mind: a contract is due, and finding the directory,
	 * finding the row and opening its menu is three steps of looking for something they can
	 * already name. The form is the same form those surfaces open, opened the same way — a
	 * renewal is opened on an identity and reads everything else off the predecessor.
	 *
	 * Mounted beside the palette rather than inside it: the palette is a dialog that closes the
	 * moment the record is chosen, and what it opens has to outlive it.
	 */

	let isFormOpen = $state(false);
	let formRenderKey = $state(0);
	let renewingContractId = $state<number | undefined>(undefined);

	// registered rather than reached for: the palette reads what the application can do from the
	// one registry, so this arrives there without the palette being told about it.
	$effect(() =>
		shortcuts.register({
			id: 'contract.renew',
			scope: 'record',
			subject: 'contract' satisfies RecordSubject,
			describe: (translations) => translations.common.actions.renewContract(),
			run: (contractId) => {
				renewingContractId = contractId;
				formRenderKey += 1;
				isFormOpen = true;
			}
		})
	);
</script>

<!-- mounted only once an action has asked for it, rather than standing by on every screen. The
     three surfaces that list a contract mount this form too, and superforms keys a form by its
     schema — so a fourth copy waiting on every screen would sit in that collision permanently
     to be ready for something the reader may never ask for.

     keyed, like those three: the form holds a draft, and a second renewal started after the
     first was abandoned must not open on what was typed into it. -->
{#if renewingContractId !== undefined}
	{#key formRenderKey}
		<ContractForm
			open={isFormOpen}
			onOpenChange={(isOpen) => {
				if (!isOpen) {
					formRenderKey += 1;
					// forgotten with the form, so the next screen is back to carrying no copy of it.
					renewingContractId = undefined;
				}

				isFormOpen = isOpen;
			}}
			renewsContractId={renewingContractId}
		/>
	{/key}
{/if}
