<script lang="ts">
	import StandaloneSurface from '@rentable/design/block/standalone-surface.svelte';
	import SurfaceAction from '@rentable/design/block/surface-action.svelte';
	import FieldError from '@rentable/design/block/field-error.svelte';
	import { Button } from '@rentable/design/primitive/button/index.js';
	import { Callout } from '@rentable/design/primitive/callout/index.js';
	import * as Form from '@rentable/design/primitive/form/index.js';
	import * as InputGroup from '@rentable/design/primitive/input-group/index.js';
	import { LL } from '$lib/i18n/i18n-svelte';
	import ArrowRightIcon from '@lucide/svelte/icons/arrow-right';
	import BanIcon from '@lucide/svelte/icons/ban';
	import BuildingIcon from '@lucide/svelte/icons/building';
	import DatabaseIcon from '@lucide/svelte/icons/database';
	import KeyRoundIcon from '@lucide/svelte/icons/key-round';
	import LayersIcon from '@lucide/svelte/icons/layers';
	import PencilIcon from '@lucide/svelte/icons/pencil';
	import PlugIcon from '@lucide/svelte/icons/plug';
	import UnplugIcon from '@lucide/svelte/icons/unplug';
	import PlusIcon from '@lucide/svelte/icons/plus';
	import UserIcon from '@lucide/svelte/icons/user';
	import UserPlusIcon from '@lucide/svelte/icons/user-plus';
	import { defaults, superForm } from 'sveltekit-superforms';
	import { zod4 } from 'sveltekit-superforms/adapters';
	import z from 'zod';

	import {
		ORGANIZATION_NAME_LIMIT,
		PASSWORD_FLOOR,
		SETUP_STEPS,
		SETUP_WALK,
		type SetupField,
		type SetupStatement,
		type SetupStep
	} from '../setup';
	import { usernameSchema } from '../username-form';
	import { workspaceFormSchema } from '../workspace-form';
	import BackGlyph from './back-glyph.svelte';
	import WorkspaceFields from './workspace-fields.svelte';

	/**
	 * The first run, on the shared application surface.
	 *
	 * **Three steps and four fields.** Connecting the Turso account, which is a consent in the
	 * browser and nothing typed here; naming the organization, the owner's own username and their
	 * password; and naming the first workspace, which is where the walk ends: creating it signs
	 * the owner in to it and the application opens on it. There is no step showing the join link,
	 * because the link lives on the organization page and a screen asking a person to continue
	 * past it was one screen too many. `../setup.ts` describes the walk as data and this component
	 * draws each step from that description, which is what lets a `node:test` assert over the
	 * fields without a window and a component test assert over the same fields with one.
	 *
	 * **A fifth field exists and is drawn almost never.** Turso will sometimes take no group this
	 * application can work out, and then the only name left is the one the person picked on the
	 * consent screen. The route reads that refusal and hands `askGroup`, and the name step grows
	 * a group field with a sentence above it. It is deliberately not in `SETUP_WALK`: a field the
	 * walk presents is one everybody types into, and this is one almost nobody ever sees.
	 *
	 * **The sentence is a step rather than a refusal, and the connect step said so first.** The
	 * fifth fact there (`groupAskedOnce`) says that a group holding nothing yet is asked its name
	 * once, so the field is expected by the time it appears; the sentence over it says what to
	 * type and the field's own description says where the name reads. Turso's account of why sits
	 * under both, muted, as `groupDetail`: it is the machine's words behind a step rather than
	 * the headline of a failure, which is the whole of what this ticket moved.
	 *
	 * **Every step says where it is, and the two before the organization exists can be left from
	 * the card's corner.** The position is a quiet line under the title, no bar and no dots; the
	 * way back is one `SurfaceAction` in the surface's `corner` slot, which is where a reader
	 * looks for the way past a screen, and where it leads is the route's to decide. The third
	 * step has none: the name step created the organization on the account and signed the owner
	 * in, so there is nowhere behind it to go, and a return to a filled name form with a second
	 * press of create would make a second organization. It is the no-workspace surface's twin,
	 * which has no back either.
	 *
	 * **The connect step is a list, not paragraphs.** The facts a person has to know before
	 * pressing anything, and none of them asks for a group to be made, are bullets with a
	 * glyph each, the way *Supercharge the defaults* (Refactoring UI p.220) lifts a plain list: a
	 * glyph specific to the fact rather than a generic mark, and the action that helps with the
	 * first fact sits inside that fact rather than at the foot of the screen. The glyphs are muted so they do not outweigh the sentence beside them
	 * (*Balance weight and contrast*, p.56).
	 *
	 * **A machine that already holds Turso authority is not asked again.** The route reads whether
	 * it does and the connect step opens as granted, with the way on and the way to give the
	 * authority back, so a person who connected, went back to the wall and came here again is not
	 * asked for a consent the machine has.
	 *
	 * **Everything that talks to the shell is a prop.** The route wires the consent, the polling,
	 * the create and the workspace; this component draws where they have got to. That is what makes
	 * it renderable in a test with no Tauri behind it, and it is the same split the sign-in card
	 * makes.
	 *
	 * On the application surface rather than a page of its own, because it presents the
	 * application's own state, an organization that does not exist yet, and [[rules/interface]]
	 * under *Application surfaces* puts every such screen on the one block.
	 */
	let {
		step,
		consent,
		refusal,
		askGroup = false,
		groupDetail = null,
		holdsTursoAuthority,
		isConnecting,
		isCreating,
		onOpenDashboard,
		onConnect,
		onDisconnect,
		onContinue,
		onBack,
		onCreate,
		onCreateWorkspace
	}: {
		step: SetupStep;
		/** how far the consent has got, or `idle` where none has been started. */
		consent: {
			status: 'idle' | 'pending' | 'granted' | 'failed' | 'abandoned';
			error: string | null;
		};
		/**
		 * what refused the run, where something did and the way on is another consent: the
		 * group the last one landed on already holds an organization, so Rust created nothing
		 * and gave the authority back (requirement 21). Shown on the connect step above the
		 * button that starts the next consent.
		 */
		refusal: string | null;
		/**
		 * whether the name step has to ask for the Turso group. Turso refused every name this
		 * application could work out, so the person who picked the group is the last thing left
		 * to ask; the sentence above the field says what to type. `false` on every ordinary run.
		 */
		askGroup?: boolean;
		/**
		 * Turso's own account of why the name is being asked for, shown under that sentence and
		 * muted. It is in Turso's English whatever the locale is, which is why it is detail: a
		 * person acts on the sentence above it, and this is what they would quote to somebody
		 * else. `null` on every run nothing was refused on.
		 */
		groupDetail?: string | null;
		/** whether the machine already holds the authority a consent would grant. */
		holdsTursoAuthority: boolean;
		/** the consent is being opened. */
		isConnecting: boolean;
		/** the organization, or the workspace, is being created on the account. */
		isCreating: boolean;
		onOpenDashboard: () => void;
		onConnect: () => void;
		onDisconnect: () => void;
		onContinue: () => void;
		/** the corner control, on the steps before the organization exists; the route decides where
		 * each goes back to. */
		onBack: () => void;
		/** the group is `null` on every run the walk was not asked to collect one on. */
		onCreate: (
			name: string,
			username: string,
			password: string,
			group: string | null
		) => Promise<void>;
		onCreateWorkspace: (name: string) => Promise<void>;
	} = $props();

	const description = $derived(SETUP_WALK.find((candidate) => candidate.step === step));
	const fields = $derived<readonly SetupField[]>(description?.fields ?? []);
	const statements = $derived<readonly SetupStatement[]>(description?.statements ?? []);

	const title = $derived(
		{
			connect: $LL.organization.setup.connectTitle(),
			name: $LL.organization.setup.nameTitle(),
			workspace: $LL.organization.setup.workspaceTitle()
		}[step]
	);

	const subtitle = $derived(
		{
			connect: $LL.organization.setup.connectDescription(),
			name: $LL.organization.setup.nameDescription(),
			workspace: $LL.organization.setup.workspaceDescription()
		}[step]
	);

	/** where the person is, counted from one, over how many steps there are. */
	const position = $derived(
		$LL.organization.setup.position({
			step: SETUP_STEPS.indexOf(step) + 1,
			total: SETUP_STEPS.length
		})
	);

	/**
	 * Each fact with its own glyph, in the order the person needs them: how far the consent
	 * reaches, what one group may hold, which account to grant it on, where the organization
	 * will live afterwards, and the one thing the next step may ask them to type. The
	 * glyph is specific to the fact rather than a checkmark, which is the book's own
	 * recommendation on p.220.
	 */
	const statementText = (statement: SetupStatement) =>
		({
			groupCoverage: $LL.organization.setup.groupCoverage(),
			oneOrganization: $LL.organization.setup.oneOrganization(),
			accountCreation: $LL.organization.setup.accountCreation(),
			succession: $LL.organization.setup.succession(),
			groupAskedOnce: $LL.organization.setup.groupAskedOnce()
		})[statement];

	const statementGlyph: Record<SetupStatement, typeof BuildingIcon> = {
		groupCoverage: DatabaseIcon,
		// the fact is a refusal, so the glyph is one, rather than a second building beside the
		// one succession carries.
		oneOrganization: BanIcon,
		accountCreation: UserPlusIcon,
		succession: BuildingIcon,
		// the fact is about typing one word, so the glyph is the one the reader already reads as
		// writing, rather than the field's own layers repeated up here.
		groupAskedOnce: PencilIcon
	};

	/**
	 * whether the consent is granted, either because the poll said so or because the machine
	 * already held the authority when the walk opened. A consent that was started here says what
	 * it said; only a walk that has started none reads the machine's standing.
	 */
	const granted = $derived(
		consent.status === 'granted' || (consent.status === 'idle' && holdsTursoAuthority)
	);

	/**
	 * What the consent step has to say beyond the facts, and only where something happened:
	 * a create the group refused is said first, a granted consent is confirmed, an abandoned or
	 * refused consent is said, and a pending one names the browser window. Nothing is shown before the person has pressed anything, unless the
	 * machine already held the authority, in which case the confirmation is what it opens with.
	 */
	const consentNotice = $derived.by(
		(): { tone: 'success' | 'warning' | 'error'; message: string } | null => {
			// a refusal outranks everything else the step could say: it is why the person is
			// back here, and the consent it speaks of is already gone.
			if (refusal) {
				return { tone: 'error', message: refusal };
			}

			if (granted) {
				return { tone: 'success', message: $LL.organization.setup.connected() };
			}

			switch (consent.status) {
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
	// gives: the messages resolve against a locale, and at module load there is none. The
	// username's rule is the shared one the invite and rename dialogs read, so the owner's is
	// refused with the sentence every other username is.
	const SetupSchema = z.object({
		name: z
			.string()
			.trim()
			.min(1, { message: $LL.organization.setup.nameRequired() })
			.max(ORGANIZATION_NAME_LIMIT, { message: $LL.organization.setup.nameTooLong() }),
		username: usernameSchema($LL),
		password: z
			.string()
			.min(PASSWORD_FLOOR, { message: $LL.organization.setup.passwordTooShort() }),
		// the only bound is that it was given, and only where it was asked for: what a group may
		// be called is Turso's to say, and a shape refused here would be this form inventing a
		// rule about somebody else's names. A group that is not the consent's is refused by Rust,
		// by both names.
		group: z
			.string()
			.trim()
			.refine((group) => !askGroup || group.length > 0, {
				message: $LL.organization.setup.groupRequired()
			})
	});

	type SetupForm = z.infer<typeof SetupSchema>;

	let { form, constraints, errors, enhance, ...rest } = superForm<SetupForm>(
		defaults(
			zod4(
				z.object({
					name: z.string(),
					username: z.string(),
					password: z.string(),
					group: z.string()
				})
			)
		),
		{
			id: 'setup-organization',
			SPA: true,
			validators: zod4(SetupSchema),
			onUpdate: async ({ form }) => {
				if (!form.valid) return;

				await onCreate(
					form.data.name.trim(),
					form.data.username.trim(),
					form.data.password,
					// a group left in the form from an earlier refusal is not sent once the field
					// has gone: what is sent is what is on screen.
					askGroup ? form.data.group.trim() : null
				);
			}
		}
	);

	const superform = { form, constraints, errors, enhance, ...rest };

	// the third step's form is the shared workspace definition: the schema every surface that
	// names a workspace reads, and the fields drawn from it, so a name refused here is refused on
	// the no-workspace surface and in the new-workspace dialog with the same sentence. This
	// surface owns the `superForm` over it, since the standalone surface owns no `<form>`.
	const WorkspaceSchema = workspaceFormSchema($LL);

	let {
		form: workspaceForm,
		constraints: workspaceConstraints,
		errors: workspaceErrors,
		enhance: workspaceEnhance,
		...workspaceRest
	} = superForm(defaults(zod4(WorkspaceSchema)), {
		// named, because the workspace dialog the shell mounts builds a form off the same schema and
		// superforms would give both one id, and one store: typing here wrote there.
		id: 'setup-workspace',
		SPA: true,
		validators: zod4(WorkspaceSchema),
		onUpdate: async ({ form }) => {
			if (!form.valid) return;

			await onCreateWorkspace(form.data.name.trim());
		}
	});

	const workspaceSuperform = {
		form: workspaceForm,
		constraints: workspaceConstraints,
		errors: workspaceErrors,
		enhance: workspaceEnhance,
		...workspaceRest
	};

	const isBusy = $derived(isConnecting || isCreating || consent.status === 'pending');

	/** what the shell is doing, said only while it is doing it, and named for the step doing it. */
	const working = $derived(
		isCreating
			? step === 'workspace'
				? $LL.layout.noWorkspace.creating()
				: $LL.organization.setup.creating()
			: consent.status === 'pending'
				? $LL.organization.setup.connecting()
				: null
	);
</script>

<StandaloneSurface tone="neutral" {title} description={subtitle} busy={isBusy}>
	{#snippet corner()}
		{#if step !== 'workspace'}
			<!-- always available, busy or not: a consent left open in the browser creates nothing
			     on the account, so walking away from it costs nothing, and the way past a screen
			     that is disabled is a trap. Not on the third step, where the organization already
			     exists and the owner is in. -->
			<SurfaceAction label={$LL.organization.setup.back()} icon={BackGlyph} onclick={onBack} />
		{/if}
	{/snippet}

	<div class="space-y-4" data-setup-step={step}>
		<!-- where the person is, said quietly under the title: no bar and no dots. -->
		<div class="text-xs text-muted-foreground" data-setup-position>{position}</div>

		{#if step === 'connect'}
			<!-- what the person has to know before the consent, as a list with a glyph to each fact,
			     in the order they need them. The dashboard action sits inside the first fact, which
			     is the one it helps with, rather than in a row of its own at the foot. -->
			<ul class="space-y-3 text-sm text-muted-foreground">
				{#each statements as statement (statement)}
					{@const Glyph = statementGlyph[statement]}
					<li class="flex gap-3" data-setup-statement={statement}>
						<!-- centred on the sentence's first line, which is `text-sm`'s 20px, rather than
						     nudged down by a margin off the spacing ladder. -->
						<span class="flex h-5 shrink-0 items-center">
							<Glyph class="size-4" />
						</span>
						<span class="min-w-0 flex-1">
							{statementText(statement)}
							{#if statement === 'groupCoverage'}
								<Button
									variant="link"
									class="h-auto p-0 align-baseline text-sm"
									onclick={onOpenDashboard}
									disabled={isBusy}
								>
									{$LL.organization.setup.openDashboard()}
								</Button>
							{/if}
						</span>
					</li>
				{/each}
			</ul>

			{#if consentNotice}
				<Callout tone={consentNotice.tone}>{consentNotice.message}</Callout>
			{/if}

			<div class="space-y-2">
				{#if granted}
					<Button class="w-full justify-center" onclick={onContinue}>
						<ArrowRightIcon class="size-4 rtl:rotate-180" />
						{$LL.organization.setup.continue()}
					</Button>
					<!-- the way to give the authority back: outline beside the primary, its verb's glyph
					     before one word, and the callout above already says what is connected. -->
					<Button variant="outline" class="w-full justify-center" onclick={onDisconnect}>
						<UnplugIcon class="size-4" />
						{$LL.organization.dashboard.forgetAccount()}
					</Button>
				{:else}
					<Button class="w-full justify-center" onclick={onConnect} disabled={isBusy}>
						<PlugIcon class="size-4" />
						{isConnecting ? $LL.common.actions.working() : $LL.organization.setup.connect()}
					</Button>
				{/if}
			</div>
		{:else if step === 'name'}
			<!-- the three fields, and they are the three the walk description names. A fourth would
			     render here only if it were added to `SETUP_WALK`, which is what the test reads,
			     or where Turso has left the group to be asked for, which is the block at the foot
			     of the form. Each carries its subject's glyph ahead of the input, muted so it does
			     not outweigh the label (*Balance weight and contrast*, p.56); the error still
			     marks the label line, which is the field's own treatment. -->
			<form method="POST" use:enhance class="space-y-4" data-setup-fields={fields.join(',')}>
				{#if fields.includes('name')}
					<Form.Field form={superform} name="name" class="group relative">
						<Form.Control>
							<Form.Label>{$LL.organization.setup.nameLabel()}</Form.Label>
							<InputGroup.Root data-disabled={isCreating || undefined}>
								<InputGroup.Addon>
									<BuildingIcon />
								</InputGroup.Addon>
								<InputGroup.Input
									name="name"
									bind:value={$form.name}
									placeholder={$LL.organization.setup.nameLabel()}
									autocomplete="organization"
									disabled={isCreating}
									aria-invalid={$errors.name ? 'true' : undefined}
									{...$constraints.name}
								/>
							</InputGroup.Root>
						</Form.Control>
						<FieldError />
					</Form.Field>
				{/if}

				{#if fields.includes('username')}
					<Form.Field form={superform} name="username" class="group relative">
						<Form.Control>
							<Form.Label>{$LL.organization.setup.usernameLabel()}</Form.Label>
							<InputGroup.Root data-disabled={isCreating || undefined}>
								<InputGroup.Addon>
									<UserIcon />
								</InputGroup.Addon>
								<InputGroup.Input
									name="username"
									bind:value={$form.username}
									placeholder={$LL.organization.setup.usernameLabel()}
									autocomplete="username"
									disabled={isCreating}
									aria-invalid={$errors.username ? 'true' : undefined}
									{...$constraints.username}
								/>
							</InputGroup.Root>
						</Form.Control>
						<FieldError />
					</Form.Field>
				{/if}

				{#if fields.includes('password')}
					<Form.Field form={superform} name="password" class="group relative">
						<Form.Control>
							<Form.Label>{$LL.organization.setup.passwordLabel()}</Form.Label>
							<InputGroup.Root data-disabled={isCreating || undefined}>
								<InputGroup.Addon>
									<KeyRoundIcon />
								</InputGroup.Addon>
								<InputGroup.Input
									name="password"
									type="password"
									bind:value={$form.password}
									autocomplete="new-password"
									disabled={isCreating}
									aria-invalid={$errors.password ? 'true' : undefined}
									{...$constraints.password}
								/>
							</InputGroup.Root>
						</Form.Control>
						<Form.Description>{$LL.organization.setup.passwordFloor()}</Form.Description>
						<FieldError />
					</Form.Field>
				{/if}

				{#if askGroup}
					<!-- the last resort, and the only Turso word the walk ever asks for. Turso would
					     take none of the names this application can work out, so the person who
					     picked the group on Turso's own consent screen is asked which it was. The
					     connect step said this step was coming, so the sentence above the field
					     says what to type rather than what went wrong, and its tone is `info`
					     rather than a warning for the same reason. The one under the field says
					     where the name reads. Neither tells anybody to do anything about a group. -->
					<div class="space-y-4" data-setup-group>
						<div class="space-y-2">
							<Callout tone="info">{$LL.organization.setup.groupNeeded()}</Callout>

							{#if groupDetail}
								<!-- Turso's own words, beneath the sentence and quieter than it
								     (*Balance weight and contrast*, Refactoring UI p.56): the
								     sentence is what a person acts on, and this is what they
								     would quote to somebody else. `dir="auto"` because it is
								     English prose in whichever locale the rest of the card is. -->
								<p class="text-xs text-muted-foreground" dir="auto" data-setup-group-detail>
									{groupDetail}
								</p>
							{/if}
						</div>

						<Form.Field form={superform} name="group" class="group relative">
							<Form.Control>
								<Form.Label>{$LL.organization.setup.groupLabel()}</Form.Label>
								<InputGroup.Root data-disabled={isCreating || undefined}>
									<InputGroup.Addon>
										<LayersIcon />
									</InputGroup.Addon>
									<InputGroup.Input
										name="group"
										bind:value={$form.group}
										placeholder={$LL.organization.setup.groupLabel()}
										autocomplete="off"
										disabled={isCreating}
										aria-invalid={$errors.group ? 'true' : undefined}
										{...$constraints.group}
									/>
								</InputGroup.Root>
							</Form.Control>
							<Form.Description>{$LL.organization.setup.groupDescription()}</Form.Description>
							<FieldError />
						</Form.Field>
					</div>
				{/if}

				<Button type="submit" class="w-full justify-center" disabled={isCreating}>
					<PlusIcon class="size-4" />
					{isCreating ? $LL.common.actions.working() : $LL.organization.setup.create()}
				</Button>
			</form>
		{:else if step === 'workspace'}
			<!-- the one field the description names for this step, drawn from the shared workspace
			     definition, so it is the same field the no-workspace surface and the dialog draw. -->
			<form
				method="POST"
				use:workspaceEnhance
				class="space-y-4"
				data-setup-fields={fields.join(',')}
			>
				{#if fields.includes('workspace')}
					<WorkspaceFields superform={workspaceSuperform} disabled={isCreating} />
				{/if}

				<Button type="submit" class="w-full justify-center" disabled={isCreating}>
					<PlusIcon class="size-4" />
					{isCreating ? $LL.common.actions.working() : $LL.layout.noWorkspace.create()}
				</Button>
			</form>
		{/if}

		{#if working}
			<div class="text-center text-sm text-muted-foreground">{working}</div>
		{/if}
	</div>
</StandaloneSurface>
