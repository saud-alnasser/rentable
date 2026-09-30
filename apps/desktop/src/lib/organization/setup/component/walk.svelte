<script lang="ts">
	import StandaloneSurface from '@rentable/design/block/standalone-surface.svelte';
	import BackControl from '@rentable/design/block/back-control.svelte';
	import { LL } from '$lib/i18n/i18n-svelte';
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
	import { usernameSchema } from '$lib/organization/member/username-form';
	import ConnectStep from './connect-step.svelte';
	import ExistingStep from './existing-step.svelte';
	import NameStep from './name-step.svelte';

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
	 * **Each step is drawn by a component of its own** (`connect-step.svelte`, `existing-step.svelte`
	 * and `name-step.svelte`); the walk holds the forms and the open disclosure, so what a person
	 * typed or opened outlives a visit to another step, as it did when the walk drew all three.
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
			<ConnectStep
				{consent}
				{refusal}
				{holdsTursoAuthority}
				{statements}
				{isBusy}
				{isConnecting}
				bind:factsOpen={isFactsOpen}
				{onOpenDashboard}
				{onConnect}
				{onDisconnect}
				{onContinue}
			/>
		{:else if step === 'existing'}
			<ExistingStep superform={existingSuperform} {isCreating} {existingRefusal} />
		{:else if step === 'name'}
			<NameStep {superform} {fields} {askGroup} {groupDetail} {isCreating} />
		{/if}

		{#if working}
			<div class="text-center text-sm text-muted-foreground">{working}</div>
		{/if}
	</div>
</StandaloneSurface>
