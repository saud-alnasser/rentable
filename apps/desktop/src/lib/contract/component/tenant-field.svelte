<script lang="ts" module>
	import { useFetchTenant, useFetchTenants } from '$lib/tenant/ui';

	const MAX_VISIBLE_TENANTS = 20;

	const toTenantOption = (tenant: {
		id: string;
		name: string;
		nationalId: string;
		phone: string;
	}) => ({
		id: tenant.id,
		tenantId: tenant.id.toString(),
		name: tenant.name,
		details: [tenant.nationalId, tenant.phone].filter(Boolean).join(' • '),
		searchValue: [tenant.name, tenant.nationalId, tenant.phone].filter(Boolean).join(' ')
	});

	/**
	 * The tenants the picker offers for a search, and the one the form has chosen, read for the
	 * form holding the choice. The form reads the chosen tenant too, to name it above its fields,
	 * so the reads are made where the form is rather than inside the field.
	 */
	export function useTenantChoice(choice: {
		open: () => boolean;
		search: () => string;
		tenantId: () => string;
	}) {
		const normalizedTenantSearch = $derived.by(() => choice.search().trim().toLowerCase());

		// bounded, and narrowed in SQL. This read used to ask for every tenant and keep twenty of
		// them in the browser — 543 kB in one call at the measured stress scale, on every open of
		// this form. ADR 0010 declined to license that and parked it as a form question; this is
		// the form. `placeholderData` on the hook holds the previous page while a new term is in
		// flight, so the list narrows rather than emptying between keystrokes.
		const tenantsQuery = useFetchTenants(() => ({
			enabled: choice.open(),
			search: normalizedTenantSearch || undefined,
			limit: MAX_VISIBLE_TENANTS
		}));

		const selectedTenantQuery = useFetchTenant(() => ({
			id: choice.tenantId() || undefined,
			enabled: choice.open() && Boolean(choice.tenantId())
		}));

		// the picker opens on the tenants rather than on an instruction to search for one: the
		// query answers an empty term with the first page by name, so there is always something to
		// choose from. Nothing is re-filtered here — the term is the query's.
		const tenantOptions = $derived.by(() =>
			(tenantsQuery.data ?? []).map((tenant) => toTenantOption(tenant))
		);

		const selectedTenant = $derived.by(() => {
			if (!choice.tenantId()) return undefined;

			return (
				(tenantsQuery.data ?? [])
					.map((tenant) => toTenantOption(tenant))
					.find((tenant) => tenant.tenantId === choice.tenantId()) ??
				(selectedTenantQuery.data ? toTenantOption(selectedTenantQuery.data) : undefined)
			);
		});
		const isTenantResultsLoading = $derived.by(
			() => tenantsQuery.isLoading && (tenantsQuery.data ?? []).length === 0
		);

		return {
			get options() {
				return tenantOptions;
			},
			get selected() {
				return selectedTenant;
			},
			get isLoading() {
				return isTenantResultsLoading;
			},
			get isSelectedLoading() {
				return selectedTenantQuery.isLoading;
			}
		};
	}

	export type TenantChoice = ReturnType<typeof useTenantChoice>;
</script>

<script lang="ts">
	import { Button } from '@rentable/design/primitive/button/index.js';
	import * as Command from '@rentable/design/primitive/command/index.js';
	import FieldError from '@rentable/design/block/field-error.svelte';
	import { insetControl } from '@rentable/design/block/form-surface.svelte';
	import * as Form from '@rentable/design/primitive/form/index.js';
	import * as Popover from '@rentable/design/primitive/popover/index.js';
	import { cn } from '@rentable/design/tailwind.js';
	import type { ContractForm } from '$lib/contract/form';
	import { LL } from '$lib/i18n/i18n-svelte';
	import CheckIcon from '@lucide/svelte/icons/check';
	import ChevronDownIcon from '@lucide/svelte/icons/chevron-down';
	import type { SuperForm } from 'sveltekit-superforms';

	/**
	 * The contract form's tenant: a combobox over the tenants' search, one chosen. Locked on a
	 * renewal, whose tenant is the predecessor's.
	 */
	let {
		superform,
		choice,
		disabled,
		open = $bindable(),
		search = $bindable()
	}: {
		superform: SuperForm<ContractForm>;
		choice: TenantChoice;
		disabled: boolean;
		/** whether the picker is open, which the form shuts as it opens and closes. */
		open: boolean;
		/** the picker's search, which the form clears as it opens and closes. */
		search: string;
	} = $props();

	const form = $derived(superform.form);
	const errors = $derived(superform.errors);

	const selectTenant = (tenantId: string) => {
		$form.tenantId = tenantId;
		open = false;
		search = '';
	};
</script>

<Form.Field form={superform} name="tenantId" class="group relative">
	<Form.Control>
		<Form.Label>{$LL.common.labels.tenant()}</Form.Label>
		<Popover.Root bind:open>
			<Popover.Trigger>
				{#snippet child({ props })}
					<Button
						{...props}
						variant="outline"
						{disabled}
						class={cn(
							'w-full justify-between font-normal',
							insetControl,
							!choice.selected && 'text-muted-foreground'
						)}
						aria-invalid={$errors.tenantId ? 'true' : undefined}
					>
						<span class="min-w-0 flex-1 truncate text-start">
							{choice.selected?.name ||
								(choice.isSelectedLoading
									? $LL.contracts.form.loadingTenant()
									: $LL.contracts.form.searchAndSelectTenant())}
						</span>
						<ChevronDownIcon class="size-4 shrink-0 opacity-50" />
					</Button>
				{/snippet}
			</Popover.Trigger>

			<Popover.Content class="w-(--bits-popover-anchor-width) p-0" align="start">
				<Command.Root class="w-full" shouldFilter={false}>
					<Command.Input
						bind:value={search}
						placeholder={$LL.contracts.form.searchTenantPlaceholder()}
					/>
					<Command.List>
						{#if choice.isLoading && choice.options.length === 0}
							<div class="p-3 text-sm text-muted-foreground">
								{$LL.contracts.form.loadingTenants()}
							</div>
						{:else if choice.options.length === 0}
							<div class="p-3 text-sm text-muted-foreground">
								{$LL.contracts.form.noTenantFound()}
							</div>
						{:else}
							<Command.Group>
								{#each choice.options as tenant (tenant.id)}
									<Command.Item
										value={tenant.tenantId}
										onSelect={() => selectTenant(tenant.tenantId)}
									>
										<div class="flex min-w-0 flex-1 flex-col text-start">
											<span class="truncate">{tenant.name}</span>
											{#if tenant.details}
												<span class="truncate text-xs text-muted-foreground">
													{tenant.details}
												</span>
											{/if}
										</div>
										<CheckIcon
											class={cn(
												'ms-auto size-4',
												$form.tenantId === tenant.tenantId ? 'opacity-100' : 'opacity-0'
											)}
										/>
									</Command.Item>
								{/each}
							</Command.Group>
						{/if}
					</Command.List>
				</Command.Root>
			</Popover.Content>
		</Popover.Root>
	</Form.Control>
	<FieldError />
</Form.Field>
