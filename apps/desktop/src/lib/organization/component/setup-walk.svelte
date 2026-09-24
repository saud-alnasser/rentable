<script lang="ts">
	import StandaloneSurface from '@rentable/design/block/standalone-surface.svelte';
	import BackControl from '@rentable/design/block/back-control.svelte';
	import FieldError from '@rentable/design/block/field-error.svelte';
	import { Button } from '@rentable/design/primitive/button/index.js';
	import { Callout } from '@rentable/design/primitive/callout/index.js';
	import * as Collapsible from '@rentable/design/primitive/collapsible/index.js';
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
		SETUP_WALK,
		stepsOf,
		type SetupField,
		type SetupStatement,
		type SetupStep,
		type WalkRefusal
	} from '../setup';
	import DetailDisclosure from '$lib/error/component/detail-disclosure.svelte';
	import { usernameSchema } from '../username-form';

	/**
	 * The first run, on the shared application surface.
	 *
	 * **Two steps and three fields.** Connecting the Turso account, which is a consent in the
	 * browser and nothing typed here; and naming the organization, the owner's own username and
	 * their password. Creating it signs the owner in, and the route hands over to the loading pass,
	 * whose first stage makes the first workspace for them (effort 832, requirement 18). Nothing
	 * after the create is drawn here: the walk stays on its working surface until the loading
	 * surface replaces it.
	 *
	 * **And a second way out of the first step, which is two steps long.** An account that already
	 * holds an organization is connected to rather than refused (effort 828, requirement 14), so
	 * the consent leads either to naming one or to the `existing` step, where its owner signs in
	 * and this machine joins what is there. The step says one sentence, asks for the username and
	 * the password, and marks the password when the pair opens nothing; the position line counts
	 * over whichever of the two ways the step belongs to, which is what `stepsOf` answers. There is no step showing the join link,
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
	 * **Every step says where it is, and every step can be left from the card's corner.** The
	 * position is a quiet line under the title, no bar and no dots; the way back is the shared
	 * `back-control` in the surface's `corner` slot, which is where a reader looks for the way past
	 * a screen, and where it leads is the route's to decide.
	 *
	 * **The connect step says one line and offers the consent** (effort 832, requirements 17 and
	 * 18). The line is the card's description; the facts that used to stand between it and the
	 * button are behind a disclosure under the button, closed, the way the sign-in card keeps its
	 * help. Apple's onboarding guidance, which the human asked design calls here to follow, is to
	 * ask for as little as possible and get people in fast: a person who wants the facts first
	 * opens them, and one who does not is one press from the consent. Opened, they are the list
	 * they were, a glyph to each fact, the way *Supercharge the defaults* (Refactoring UI p.220)
	 * lifts a plain list, with the action that helps with the first fact inside that fact. The
	 * glyphs are muted so they do not outweigh the sentence beside them (*Balance weight and
	 * contrast*, p.56).
	 *
	 * **A machine that already holds Turso authority is not asked again.** The route reads whether
	 * it does and the connect step opens as granted, with the way on and the way to give the
	 * authority back, so a person who connected, went back to the wall and came here again is not
	 * asked for a consent the machine has.
	 *
	 * **Everything that talks to the shell is a prop.** The route wires the consent, the polling
	 * and the create; this component draws where they have got to. That is what makes
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
		existingRefusal = null,
		holdsTursoAuthority,
		isConnecting,
		isCreating,
		onOpenDashboard,
		onConnect,
		onDisconnect,
		onContinue,
		onBack,
		onCreate,
		onConnectExisting
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
		 * button that starts the next consent, as a sentence with the shell's words behind a
		 * disclosure.
		 */
		refusal: WalkRefusal | null;
		/**
		 * whether the name step has to ask for the Turso group. Turso refused every name this
		 * application could work out, so the person who picked the group is the last thing left
		 * to ask; the sentence above the field says what to type. `false` on every ordinary run.
		 */
		askGroup?: boolean;
		/**
		 * Turso's own account of why the name is being asked for, behind a disclosure under that
		 * sentence. It is in Turso's English whatever the locale is, which is why it is detail: a
		 * person acts on the sentence above it, and this is what they would quote to somebody
		 * else. `null` on every run nothing was refused on.
		 */
		groupDetail?: string | null;
		/**
		 * why the last attempt to connect to the organization the account holds was refused, shown
		 * on the `existing` step against the password field. `null` before anything was tried and
		 * after a refusal the walk answered by going back to the consent, which carries its
		 * sentence as `refusal` instead.
		 */
		existingRefusal?: WalkRefusal | null;
		/** whether the machine already holds the authority a consent would grant. */
		holdsTursoAuthority: boolean;
		/** the consent is being opened. */
		isConnecting: boolean;
		/**
		 * the organization is being created on the account, or the owner is being connected to the
		 * one it holds, and after either, until the loading surface takes over.
		 */
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
		/** the owner signing in to the organization the account already holds. */
		onConnectExisting: (username: string, password: string) => Promise<void>;
	} = $props();

	const description = $derived(SETUP_WALK.find((candidate) => candidate.step === step));
	const fields = $derived<readonly SetupField[]>(description?.fields ?? []);
	const statements = $derived<readonly SetupStatement[]>(description?.statements ?? []);

	const title = $derived(
		{
			connect: $LL.organization.setup.connectTitle(),
			existing: $LL.organization.setup.existingTitle(),
			name: $LL.organization.setup.nameTitle()
		}[step]
	);

	const subtitle = $derived(
		{
			connect: $LL.organization.setup.connectDescription(),
			existing: $LL.organization.setup.existingDescription(),
			name: $LL.organization.setup.nameDescription()
		}[step]
	);

	/**
	 * where the person is, counted from one, over how many steps the way they are on has. The
	 * consent cannot know which way that is until it has answered, so it counts over the walk that
	 * creates; the step after it counts over its own.
	 */
	const position = $derived.by(() => {
		const steps = stepsOf(step);

		return $LL.organization.setup.position({
			step: steps.indexOf(step) + 1,
			total: steps.length
		});
	});

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
		(): {
			tone: 'success' | 'warning' | 'error';
			message: string;
			detail: string | null;
		} | null => {
			// a refusal outranks everything else the step could say: it is why the person is
			// back here, and the consent it speaks of is already gone.
			if (refusal) {
				return { tone: 'error', message: refusal.sentence, detail: refusal.detail };
			}

			if (granted) {
				return { tone: 'success', message: $LL.organization.setup.connected(), detail: null };
			}

			switch (consent.status) {
				case 'abandoned':
					return {
						tone: 'warning',
						message: $LL.organization.setup.consentAbandoned(),
						detail: null
					};
				case 'failed':
					// what the authorization server said is its own words, in its own language, so it
					// sits behind a disclosure under the sentence rather than inside it.
					return {
						tone: 'error',
						message: $LL.organization.setup.consentFailed(),
						detail: consent.error
					};
				default:
					return null;
			}
		}
	);

	// **Built here rather than at module load**, for the reason `workspace/component/rename-form`
	// gives: the messages resolve against a locale, and at module load there is none. The
	// username's rule is the shared one the invite dialog and the member's sheet read, so the owner's is
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

	// the owner's own pair, on the step that connects to what the account already holds. A form of
	// its own rather than the create's two fields reused: nothing here is refused on a floor, since
	// the password being asked for already exists and a rule this screen invented would refuse a
	// password the organization accepts.
	const ExistingSchema = z.object({
		username: z.string().trim().min(1),
		password: z.string().min(1)
	});

	type ExistingForm = z.infer<typeof ExistingSchema>;

	let {
		form: existingForm,
		constraints: existingConstraints,
		errors: existingErrors,
		enhance: existingEnhance,
		...existingRest
	} = superForm<ExistingForm>(defaults(zod4(ExistingSchema)), {
		id: 'setup-existing',
		SPA: true,
		validators: zod4(ExistingSchema),
		onUpdate: async ({ form }) => {
			if (!form.valid) return;

			await onConnectExisting(form.data.username.trim(), form.data.password);
		}
	});

	const existingSuperform = {
		form: existingForm,
		constraints: existingConstraints,
		errors: existingErrors,
		enhance: existingEnhance,
		...existingRest
	};

	const isBusy = $derived(isConnecting || isCreating || consent.status === 'pending');

	/** whether the connect step's facts are open. Closed on every visit, until asked for. */
	let isFactsOpen = $state(false);

	/** what the shell is doing, said only while it is doing it, and named for the step doing it. */
	const working = $derived(
		isCreating
			? step === 'existing'
				? $LL.organization.setup.existingConnecting()
				: $LL.organization.setup.creating()
			: consent.status === 'pending'
				? $LL.organization.setup.connecting()
				: null
	);
</script>

<StandaloneSurface tone="neutral" {title} description={subtitle} busy={isBusy}>
	{#snippet corner()}
		<!-- always available, busy or not: a consent left open in the browser creates nothing on
		     the account, so walking away from it costs nothing, and the way past a screen that is
		     disabled is a trap. Once the organization is created the loading surface is drawn over
		     this one, so it is never pressed with a created organization behind it. -->
		<BackControl label={$LL.organization.setup.back()} onclick={onBack} />
	{/snippet}

	<div class="space-y-4" data-setup-step={step}>
		<!-- where the person is, said quietly under the title: no bar and no dots. -->
		<div class="text-xs text-muted-foreground" data-setup-position>{position}</div>

		{#if step === 'connect'}
			{#if consentNotice}
				<div class="space-y-1" data-setup-consent-notice>
					<Callout tone={consentNotice.tone}>{consentNotice.message}</Callout>

					{#if consentNotice.detail}
						<DetailDisclosure detail={consentNotice.detail} name="consent" />
					{/if}
				</div>
			{/if}

			<div class="space-y-2">
				{#if granted}
					<!-- the way on asks the account what it already holds before it decides which step
					     follows, which is a round trip: disabled while it is in flight, and saying so,
					     because a second press would ask again. -->
					<Button class="w-full justify-center" onclick={onContinue} disabled={isBusy}>
						<ArrowRightIcon class="size-4 rtl:rotate-180" />
						{isConnecting ? $LL.common.actions.working() : $LL.organization.setup.continue()}
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

			<!-- the facts, closed, under the button: quiet, the way the sign-in card keeps its help, so
			     the card is one line and the consent until somebody asks for more. Opened, they are a
			     list with a glyph to each fact, in the order they are needed, and the dashboard action
			     sits inside the first fact, which is the one it helps with. -->
			<Collapsible.Root bind:open={isFactsOpen} data-setup-facts>
				<Collapsible.Trigger>
					{#snippet child({ props })}
						<Button
							{...props}
							variant="link"
							size="sm"
							class="w-full justify-center text-muted-foreground"
						>
							{$LL.organization.setup.connectDetails()}
						</Button>
					{/snippet}
				</Collapsible.Trigger>

				<Collapsible.Content>
					<!-- drawn only while open, so facts nobody asked for reach neither a reader nor a
					     screen reader. -->
					{#if isFactsOpen}
						<ul class="space-y-3 pt-2 text-sm text-muted-foreground">
							{#each statements as statement (statement)}
								{@const Glyph = statementGlyph[statement]}
								<li class="flex gap-3" data-setup-statement={statement}>
									<!-- centred on the sentence's first line, which is `text-sm`'s 20px,
									     rather than nudged down by a margin off the spacing ladder. -->
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
					{/if}
				</Collapsible.Content>
			</Collapsible.Root>
		{:else if step === 'existing'}
			<!-- the owner's own pair, and nothing else. The sentence above the card already said
			     whose account this is and who signs in here, so the fields carry their subject's
			     glyph and no description: this is a sign-in, and the person typing already knows
			     what they are typing. A pair that opens nothing marks the password and says so
			     under it, which is where a reader looks after pressing. -->
			<form
				method="POST"
				use:existingEnhance
				class="space-y-4"
				data-setup-fields="username,password"
			>
				<Form.Field form={existingSuperform} name="username" class="group relative">
					<Form.Control>
						<Form.Label>{$LL.organization.setup.usernameLabel()}</Form.Label>
						<InputGroup.Root data-disabled={isCreating || undefined}>
							<InputGroup.Addon>
								<UserIcon />
							</InputGroup.Addon>
							<InputGroup.Input
								name="username"
								bind:value={$existingForm.username}
								placeholder={$LL.organization.setup.usernameLabel()}
								autocomplete="username"
								disabled={isCreating}
								aria-invalid={$existingErrors.username ? 'true' : undefined}
								{...$existingConstraints.username}
							/>
						</InputGroup.Root>
					</Form.Control>
					<FieldError />
				</Form.Field>

				<Form.Field form={existingSuperform} name="password" class="group relative">
					<Form.Control>
						<Form.Label>{$LL.organization.setup.passwordLabel()}</Form.Label>
						<InputGroup.Root data-disabled={isCreating || undefined}>
							<InputGroup.Addon>
								<KeyRoundIcon />
							</InputGroup.Addon>
							<InputGroup.Input
								name="password"
								type="password"
								bind:value={$existingForm.password}
								autocomplete="current-password"
								disabled={isCreating}
								aria-invalid={$existingErrors.password || existingRefusal ? 'true' : undefined}
								{...$existingConstraints.password}
							/>
						</InputGroup.Root>
					</Form.Control>
					<FieldError />
					{#if existingRefusal}
						<p class="text-sm text-destructive" data-setup-existing-refusal>
							{existingRefusal.sentence}
						</p>

						{#if existingRefusal.detail}
							<DetailDisclosure detail={existingRefusal.detail} name="existing" />
						{/if}
					{/if}
				</Form.Field>

				<Button type="submit" class="w-full justify-center" disabled={isCreating}>
					<PlugIcon class="size-4" />
					{isCreating ? $LL.common.actions.working() : $LL.organization.setup.existingConnect()}
				</Button>
			</form>
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
								<!-- Turso's own words, beneath the sentence, behind a disclosure and
								     quieter than it (*Balance weight and contrast*, Refactoring UI
								     p.56): the sentence is what a person acts on, and this is what
								     they would quote to somebody else, in Turso's English whatever
								     the locale is. -->
								<DetailDisclosure detail={groupDetail} name="group" />
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
		{/if}

		{#if working}
			<div class="text-center text-sm text-muted-foreground">{working}</div>
		{/if}
	</div>
</StandaloneSurface>
