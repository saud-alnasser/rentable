<script lang="ts">
	import type { OrganizationCreated } from '$lib/platform/tauri';
	import StandaloneSurface from '@rentable/design/block/standalone-surface.svelte';
	import FieldError from '@rentable/design/block/field-error.svelte';
	import { Button } from '@rentable/design/primitive/button/index.js';
	import { Callout } from '@rentable/design/primitive/callout/index.js';
	import * as Form from '@rentable/design/primitive/form/index.js';
	import { Input } from '@rentable/design/primitive/input/index.js';
	import { LL } from '$lib/i18n/i18n-svelte';
	import CopyIcon from '@lucide/svelte/icons/copy';
	import ExternalLinkIcon from '@lucide/svelte/icons/external-link';
	import { defaults, superForm } from 'sveltekit-superforms';
	import { zod4 } from 'sveltekit-superforms/adapters';
	import z from 'zod';

	import {
		ORGANIZATION_NAME_LIMIT,
		PASSWORD_FLOOR,
		SETUP_WALK,
		type SetupField,
		type SetupStatement,
		type SetupStep
	} from '../setup';

	/**
	 * The first run, on the shared application surface.
	 *
	 * **Three steps and two fields.** Connecting the Turso account, which is a consent in the
	 * browser and nothing typed here; naming the organization and choosing a password, which is
	 * the whole of what is typed; and the link to hand out. `../setup.ts` describes the walk as
	 * data and this component draws each step from that description, which is what lets a
	 * `node:test` assert over the fields without a window and a component test assert over the
	 * same fields with one.
	 *
	 * **Everything that talks to the shell is a prop.** The route wires the consent, the polling
	 * and the create; this component draws where they have got to. That is what makes it
	 * renderable in a test with no Tauri behind it, and it is the same split the sign-in card
	 * makes.
	 *
	 * On the application surface rather than a page of its own, because it presents the
	 * application's own state, an organization that does not exist yet, and [[rules/interface]]
	 * under *Application surfaces* puts every such screen on the one block.
	 */
	let {
		step,
		consent,
		isConnecting,
		isCreating,
		created,
		linkCopied,
		onOpenDashboard,
		onConnect,
		onDisconnect,
		onContinue,
		onBack,
		onCreate,
		onCopyLink
	}: {
		step: SetupStep;
		/** how far the consent has got, or `idle` where none has been started. */
		consent: {
			status: 'idle' | 'pending' | 'granted' | 'failed' | 'abandoned';
			error: string | null;
		};
		/** the consent is being opened. */
		isConnecting: boolean;
		/** the organization is being created on the account. */
		isCreating: boolean;
		created: OrganizationCreated | null;
		linkCopied: boolean;
		onOpenDashboard: () => void;
		onConnect: () => void;
		onDisconnect: () => void;
		onContinue: () => void;
		onBack: () => void;
		onCreate: (name: string, password: string) => Promise<void>;
		onCopyLink: () => void;
	} = $props();

	const description = $derived(SETUP_WALK.find((candidate) => candidate.step === step));
	const fields = $derived<readonly SetupField[]>(description?.fields ?? []);
	const statements = $derived<readonly SetupStatement[]>(description?.statements ?? []);

	const title = $derived(
		{
			connect: $LL.organization.setup.connectTitle(),
			name: $LL.organization.setup.nameTitle(),
			done: $LL.organization.setup.doneTitle()
		}[step]
	);

	const subtitle = $derived(
		{
			connect: $LL.organization.setup.connectDescription(),
			name: $LL.organization.setup.nameDescription(),
			done: $LL.organization.setup.doneDescription()
		}[step]
	);

	const statementText = (statement: SetupStatement) =>
		({
			groupPreparation: $LL.organization.setup.groupPreparation(),
			accountCreation: $LL.organization.setup.accountCreation(),
			succession: $LL.organization.setup.succession()
		})[statement];

	/**
	 * What the consent step has to say beyond the statements, and only where something happened:
	 * a granted consent is confirmed, an abandoned or refused one is said, and a pending one names
	 * the browser window. Nothing is shown before the person has pressed anything.
	 */
	const consentNotice = $derived.by(
		(): { tone: 'success' | 'warning' | 'error'; message: string } | null => {
			switch (consent.status) {
				case 'granted':
					return { tone: 'success', message: $LL.organization.setup.connected() };
				case 'abandoned':
					return { tone: 'warning', message: $LL.organization.setup.consentAbandoned() };
				case 'failed':
					return {
						tone: 'error',
						message: consent.error
							? `${$LL.organization.setup.consentFailed()} ${consent.error}`
							: $LL.organization.setup.consentFailed()
					};
				default:
					return null;
			}
		}
	);

	// **Built here rather than at module load**, for the reason `workspace/component/rename-form`
	// gives: the messages resolve against a locale, and at module load there is none.
	const SetupSchema = z.object({
		name: z
			.string()
			.trim()
			.min(1, { message: $LL.organization.setup.nameRequired() })
			.max(ORGANIZATION_NAME_LIMIT, { message: $LL.organization.setup.nameTooLong() }),
		password: z.string().min(PASSWORD_FLOOR, { message: $LL.organization.setup.passwordTooShort() })
	});

	type SetupForm = z.infer<typeof SetupSchema>;

	let { form, constraints, errors, enhance, ...rest } = superForm<SetupForm>(
		defaults(zod4(z.object({ name: z.string(), password: z.string() }))),
		{
			SPA: true,
			validators: zod4(SetupSchema),
			onUpdate: async ({ form }) => {
				if (!form.valid) return;

				await onCreate(form.data.name.trim(), form.data.password);
			}
		}
	);

	const superform = { form, constraints, errors, enhance, ...rest };

	const isBusy = $derived(isConnecting || isCreating || consent.status === 'pending');

	/** what the shell is doing, said only while it is doing it. */
	const working = $derived(
		isCreating
			? $LL.organization.setup.creating()
			: consent.status === 'pending'
				? $LL.organization.setup.connecting()
				: null
	);
</script>

<StandaloneSurface tone="neutral" {title} description={subtitle} busy={isBusy}>
	<div class="space-y-4 pt-2" data-setup-step={step}>
		{#if step === 'connect'}
			<!-- what the person has to know before the consent, in the order they need it: the
			     group they prepare, where an account comes from, and what succession costs. Each is
			     a sentence rather than a box, because a box on every visit is not a notice. -->
			<div class="space-y-3 text-sm text-muted-foreground">
				{#each statements as statement (statement)}
					<p data-setup-statement={statement}>{statementText(statement)}</p>
				{/each}
			</div>

			{#if consentNotice}
				<Callout tone={consentNotice.tone}>{consentNotice.message}</Callout>
			{/if}

			<div class="space-y-2">
				{#if consent.status === 'granted'}
					<Button class="w-full justify-center" onclick={onContinue}>
						{$LL.organization.setup.continue()}
					</Button>
					<Button variant="link" class="w-full justify-center" onclick={onDisconnect}>
						{$LL.organization.disconnectAction()}
					</Button>
				{:else}
					<Button class="w-full justify-center" onclick={onConnect} disabled={isBusy}>
						{isConnecting ? $LL.common.actions.working() : $LL.organization.setup.connect()}
					</Button>
					<Button
						variant="outline"
						class="w-full justify-center"
						onclick={onOpenDashboard}
						disabled={isBusy}
					>
						<ExternalLinkIcon class="size-4" />
						{$LL.organization.setup.openDashboard()}
					</Button>
				{/if}
			</div>
		{:else if step === 'name'}
			<!-- the two fields, and they are the two the walk description names. A third would
			     render here only if it were added to `SETUP_WALK`, which is what the test reads. -->
			<form method="POST" use:enhance class="space-y-4" data-setup-fields={fields.join(',')}>
				{#if fields.includes('name')}
					<Form.Field form={superform} name="name" class="group relative">
						<Form.Control>
							<Form.Label>{$LL.organization.setup.nameLabel()}</Form.Label>
							<Input
								name="name"
								bind:value={$form.name}
								placeholder={$LL.organization.setup.nameLabel()}
								autocomplete="organization"
								aria-invalid={$errors.name ? 'true' : undefined}
								{...$constraints.name}
							/>
						</Form.Control>
						<FieldError />
					</Form.Field>
				{/if}

				{#if fields.includes('password')}
					<Form.Field form={superform} name="password" class="group relative">
						<Form.Control>
							<Form.Label>{$LL.organization.setup.passwordLabel()}</Form.Label>
							<Input
								name="password"
								type="password"
								bind:value={$form.password}
								autocomplete="new-password"
								aria-invalid={$errors.password ? 'true' : undefined}
								{...$constraints.password}
							/>
						</Form.Control>
						<Form.Description>{$LL.organization.setup.passwordFloor()}</Form.Description>
						<FieldError />
					</Form.Field>
				{/if}

				<div class="flex flex-col gap-2 sm:flex-row sm:justify-end sm:gap-3">
					<Button type="button" variant="outline" onclick={onBack} disabled={isCreating}>
						{$LL.organization.setup.back()}
					</Button>
					<Button type="submit" disabled={isCreating}>
						{isCreating ? $LL.common.actions.working() : $LL.organization.setup.create()}
					</Button>
				</div>
			</form>
		{:else if step === 'done' && created}
			{#if !created.synced}
				<Callout tone="warning">{$LL.organization.setup.notYetSent()}</Callout>
			{/if}

			<div class="space-y-2">
				<p class="text-sm font-medium">{$LL.organization.setup.linkLabel()}</p>
				<!-- a machine's string, so it reads left to right in both locales
				     ([[rules/frontend]], *i18n*). -->
				<code
					dir="ltr"
					class="block overflow-x-auto rounded-md bg-muted px-3 py-2 text-xs break-all select-all"
					data-join-link>{created.joinLink}</code
				>
			</div>

			<div class="space-y-2">
				<Button class="w-full justify-center" onclick={onCopyLink}>
					<CopyIcon class="size-4" />
					{linkCopied ? $LL.organization.setup.linkCopied() : $LL.organization.setup.copyLink()}
				</Button>
				<Button variant="link" class="w-full justify-center" onclick={onContinue}>
					{$LL.organization.setup.continue()}
				</Button>
			</div>
		{/if}

		{#if working}
			<p class="text-center text-sm text-muted-foreground">{working}</p>
		{/if}
	</div>
</StandaloneSurface>
