<script lang="ts">
	import { TenantSchema, type Tenant } from '$lib/platform/database/schema';
	import { identityField, phone } from '$lib/tenant/tenant';
	import FormSurface from '$lib/design/block/form-surface.svelte';
	import { Button } from '$lib/design/primitive/button';
	import * as Form from '$lib/design/primitive/form';
	import { Input } from '$lib/design/primitive/input';
	import * as Select from '$lib/design/primitive/select';
	import { LL } from '$lib/i18n/i18n-svelte';
	import { useCreateTenant, useUpdateTenant } from '$lib/tenant/query';
	import { TRPCError } from '@trpc/server';
	import { toast } from 'svelte-sonner';
	import { defaults, setError, superForm } from 'sveltekit-superforms';
	import { zod4 } from 'sveltekit-superforms/adapters';
	import { z } from 'zod';

	const PHONE_COUNTRY_CODES = ['+966'] as const;
	type PhoneCountryCode = (typeof PHONE_COUNTRY_CODES)[number];

	const PHONE_COUNTRY_OPTIONS: Array<{ value: PhoneCountryCode; label: string }> = [
		{ value: '+966', label: '+966' }
	];

	const PHONE_VALIDATORS: Record<PhoneCountryCode, RegExp> = {
		'+966': phone
	};

	const DEFAULT_PHONE_COUNTRY_CODE: PhoneCountryCode = '+966';

	const normalizePhoneNumberInput = (value: string) => value.replace(/[^0-9]/g, '');
	const combinePhone = (phoneCountryCode: PhoneCountryCode, phoneNumber: string) =>
		`${phoneCountryCode}${normalizePhoneNumberInput(phoneNumber)}`;
	const splitPhone = (phone: string | undefined) => {
		const normalizedPhone = phone?.trim() ?? '';
		const matchingCountryCode = PHONE_COUNTRY_CODES.find((countryCode) =>
			normalizedPhone.startsWith(countryCode)
		);

		if (matchingCountryCode) {
			return {
				phoneCountryCode: matchingCountryCode,
				phoneNumber: normalizedPhone.slice(matchingCountryCode.length)
			};
		}

		return {
			phoneCountryCode: DEFAULT_PHONE_COUNTRY_CODE,
			phoneNumber: normalizePhoneNumberInput(normalizedPhone)
		};
	};

	const TenantFormSchema = z
		.object({
			id: TenantSchema.shape.id.optional(),
			name: TenantSchema.shape.name,
			nationalId: identityField($LL.tenants.form.invalidNationalId()),
			phoneCountryCode: z.enum(PHONE_COUNTRY_CODES),
			phoneNumber: z.string().trim()
		})
		.superRefine((value, ctx) => {
			const combinedPhone = combinePhone(value.phoneCountryCode, value.phoneNumber);

			if (!PHONE_VALIDATORS[value.phoneCountryCode].test(combinedPhone)) {
				ctx.addIssue({
					code: 'custom',
					path: ['phoneNumber'],
					message: $LL.tenants.form.invalidPhone({ countryCode: value.phoneCountryCode })
				});
			}
		});
	const CreateMutation = useCreateTenant();
	const UpdateMutation = useUpdateTenant();

	type TenantForm = z.infer<typeof TenantFormSchema>;

	let {
		value,
		open,
		onOpenChange
	}: {
		value?: Tenant;
		open: boolean;
		onOpenChange: (value: boolean) => void;
	} = $props();

	const toFormValue = (tenant?: Tenant): TenantForm => {
		const { phoneCountryCode, phoneNumber } = splitPhone(tenant?.phone);

		return {
			id: tenant?.id,
			name: tenant?.name ?? '',
			nationalId: tenant?.nationalId ?? '',
			phoneCountryCode,
			phoneNumber
		};
	};

	let { form, constraints, errors, enhance, reset, ...rest } = superForm<TenantForm>(
		defaults(zod4(TenantFormSchema)),
		{
			SPA: true,
			validators: zod4(TenantFormSchema),
			onUpdate: async ({ form }) => {
				if (!form.valid) return;

				const payload = {
					name: form.data.name,
					nationalId: form.data.nationalId,
					phone: combinePhone(form.data.phoneCountryCode, form.data.phoneNumber)
				};

				if (value && form.data.id) {
					const unchanged =
						value.name === payload.name &&
						value.nationalId === payload.nationalId &&
						value.phone === payload.phone;

					if (unchanged) {
						onOpenChange(false);

						return;
					}
				}

				try {
					if (form.data.id) {
						await UpdateMutation.mutateAsync({
							id: form.data.id,
							...payload
						});
					} else {
						await CreateMutation.mutateAsync(payload);
					}

					onOpenChange(false);
				} catch (e) {
					if (e instanceof TRPCError && e.code === 'BAD_REQUEST') {
						if (e.message.includes('national id')) {
							setError(form, 'nationalId', $LL.tenants.form.duplicateNationalId());
						} else if (e.message.includes('phone')) {
							setError(form, 'phoneNumber', $LL.tenants.form.duplicatePhone());
						}
					} else {
						toast.error($LL.common.messages.unexpectedError());
					}
				}
			}
		}
	);

	$effect(() => {
		if (open) {
			form.set(toFormValue(value));
		}
	});

	const superform = { form, constraints, errors, enhance, reset, ...rest };
</script>

<FormSurface {open} {onOpenChange} {enhance} weight="heavy" title={$LL.common.labels.tenant()}>
	<div class="flex flex-col gap-4 rounded-2xl border bg-muted p-4">
		<Form.Field form={superform} name="name">
			<Form.Control>
				<Form.Label>{$LL.common.labels.name()}</Form.Label>
				<Input
					bind:value={$form.name}
					placeholder={$LL.common.labels.name()}
					aria-invalid={$errors.name ? 'true' : undefined}
					{...$constraints.name}
				/>
			</Form.Control>
			<Form.Description />
		</Form.Field>

		<Form.Field form={superform} name="nationalId">
			<Form.Control>
				<Form.Label>{$LL.common.labels.nationalId()}</Form.Label>
				<Input
					bind:value={$form.nationalId}
					placeholder={$LL.common.labels.nationalId()}
					aria-invalid={$errors.nationalId ? 'true' : undefined}
					{...$constraints.nationalId}
				/>
			</Form.Control>
			<Form.Description />
		</Form.Field>

		<Form.Field form={superform} name="phoneNumber">
			<Form.Control>
				<Form.Label>{$LL.common.labels.phone()}</Form.Label>
				<div class="grid gap-3 sm:grid-cols-[9rem_minmax(0,1fr)]">
					<Select.Root type="single" bind:value={$form.phoneCountryCode}>
						<Select.Trigger
							class="w-full"
							aria-label={$LL.tenants.form.phoneCountryCode()}
							aria-invalid={$errors.phoneNumber ? 'true' : undefined}
						>
							{$form.phoneCountryCode}
						</Select.Trigger>
						<Select.Content>
							{#each PHONE_COUNTRY_OPTIONS as option (option.value)}
								<Select.Item value={option.value} label={option.label} />
							{/each}
						</Select.Content>
					</Select.Root>
					<Input
						value={$form.phoneNumber}
						oninput={(event) => {
							$form.phoneNumber = normalizePhoneNumberInput(event.currentTarget.value);
						}}
						inputmode="numeric"
						dir="ltr"
						autocomplete="tel-national"
						placeholder={$LL.tenants.form.phoneNumberPlaceholder()}
						aria-invalid={$errors.phoneNumber ? 'true' : undefined}
					/>
				</div>
			</Form.Control>
			<Form.Description />
		</Form.Field>
	</div>

	<Form.ErrorsSummary errors={$errors} class="mt-4" />

	{#snippet actions()}
		<Button
			type="button"
			variant="outline"
			disabled={CreateMutation.isPending || UpdateMutation.isPending}
			onclick={() => onOpenChange(false)}
		>
			{$LL.common.actions.cancel()}
		</Button>
		<Button
			type="submit"
			disabled={CreateMutation.isPending || UpdateMutation.isPending}
			class="capitalize"
		>
			{value?.id ? $LL.common.actions.update() : $LL.common.actions.create()}
		</Button>
	{/snippet}
</FormSurface>
