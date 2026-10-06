<script lang="ts">
	import WayInSurface from '@rentable/design/block/way-in-surface.svelte';
	import { LL } from '$lib/i18n/i18n-svelte';
	import { WayInPreferences } from '$lib/settings/ui';
	import { defaults, superForm } from 'sveltekit-superforms';
	import { zod4 } from 'sveltekit-superforms/adapters';
	import z from 'zod';

	import {
		ORGANIZATION_NAME_LIMIT,
		PASSWORD_FLOOR,
		SETUP_WALK,
		stepsOf,
		type SetupField,
		type SetupStep,
		type WalkRefusal
	} from '../setup';
	import { usernameSchema } from '$lib/organization/member/username-form';
	import ConnectStep from './connect-step.svelte';
	import ExistingStep from './existing-step.svelte';
	import NameStep from './name-step.svelte';

	/**
	 * The first run, on the way-in surface.
	 *
	 * **Two steps and four fields.** Connecting the Turso account, which is a consent in the
	 * browser and nothing typed here; and naming the organization, the owner's own username and
	 * their password, typed twice (effort 851, requirement 17). Creating it signs the owner in, and
	 * the route hands over to the loading pass, whose first stage makes the first workspace for them
	 * (effort 832, requirement 18). Nothing
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
	 * **The sentence is a step rather than a refusal.** The sentence over the field says what to
	 * type and the field's own description says where the name reads. Turso's account of why sits
	 * under both, muted, as `groupDetail`: it is the machine's words behind a step rather than
	 * the headline of a failure.
	 *
	 * **One surface that changes step** (effort 843, requirements 1, 4 and 5). The walk hands the
	 * way-in surface the step's key, where it sits in its way ("step 1 of 2", a small line above
	 * the title) and the way back, which the surface draws in the content area's corner and which
	 * leads where the route decides. A change of step runs the surface's one transition in the
	 * reading direction, the mark and the title holding still. Every step carries one prominent
	 * action, its fields are labels and inputs with no glyphs, and the language and appearance
	 * control is at the foot of each.
	 *
	 * **The connect step says one line and offers the consent** (effort 832, requirements 17 and
	 * 18, as effort 843 left them): "connect Turso", where the organization is stored, one
	 * "connect", and one line under it saying the browser opens. The five facts that sat behind a
	 * "before you connect" disclosure left the way in at the human's word on 2026-10-01; Apple's
	 * onboarding guidance, which the human asked design calls here to follow, is to ask for as
	 * little as possible and get people in fast.
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
	 * and `name-step.svelte`); the walk holds the forms, so what a person typed outlives a visit to
	 * another step, as it did when the walk drew all three.
	 *
	 * On the way-in surface, which [[rules/interface]] under *Application surfaces* gives every step
	 * before the application.
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
		const at = steps.indexOf(step) + 1;

		return {
			at,
			of: steps.length,
			label: $LL.organization.setup.position({ step: at, total: steps.length })
		};
	});

	// **Built here rather than at module load**, for the reason `workspace/component/rename-form`
	// gives: the messages resolve against a locale, and at module load there is none. The
	// username's rule is the shared one the invite dialog and the member's sheet read, so the owner's is
	// refused with the sentence every other username is.
	const SetupSchema = z
		.object({
			name: z
				.string()
				.trim()
				.min(1, { message: $LL.organization.setup.nameRequired() })
				.max(ORGANIZATION_NAME_LIMIT, { message: $LL.organization.setup.nameTooLong() }),
			username: usernameSchema($LL),
			password: z
				.string()
				.min(PASSWORD_FLOOR, { message: $LL.organization.setup.passwordTooShort() }),
			// the password again, held to nothing of its own: the one rule is that it matches.
			confirmation: z.string(),
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
		})
		// effort 851, requirement 17: two that differ are refused on the confirmation, which is
		// where the person typed last, in the join's words for it. The tenant form puts its phone
		// refusal on its field the same way.
		.superRefine((value, ctx) => {
			if (value.password !== value.confirmation) {
				ctx.addIssue({
					code: 'custom',
					path: ['confirmation'],
					message: $LL.organization.join.mismatch()
				});
			}
		});

	type SetupForm = z.infer<typeof SetupSchema>;

	let { form, constraints, errors, enhance, ...rest } = superForm<SetupForm>(
		defaults(
			zod4(
				z.object({
					name: z.string(),
					username: z.string(),
					password: z.string(),
					confirmation: z.string(),
					group: z.string()
				})
			)
		),
		{
			id: 'setup-organization',
			SPA: true,
			validators: zod4(SetupSchema),
			// **never emptied by a submit** (effort 851, requirement 30). superforms resets a valid
			// form once `onUpdate` returns, and `onCreate` returns normally from every refused
			// create, because the route catches the refusal to answer it on this step: the group
			// it asks for, or a create to press again. A create that succeeds hands over to the
			// loading surface, so there is nothing a reset would ever be wanted for.
			resetForm: false,
			onUpdate: async ({ form }) => {
				if (!form.valid) return;

				// the confirmation stops here: it has said the two match, and that is all it is for.
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
		// **never emptied by a submit** (effort 851, requirement 40), for the create form's reason:
		// `onConnectExisting` returns normally from a refused connect, because the route catches
		// the refusal to say it against the password, and a connect that succeeds hands over to
		// the loading surface.
		resetForm: false,
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

<!-- back is always available, busy or not: a consent left open in the browser creates nothing on
     the account, so walking away from it costs nothing, and the way past a screen that is disabled
     is a trap. Once the organization is created the loading surface is drawn over this one, so it
     is never pressed with a created organization behind it. -->
<WayInSurface
	{step}
	{title}
	description={subtitle}
	{position}
	back={{ label: $LL.organization.setup.back(), onclick: onBack }}
	busy={isBusy}
>
	<div class="flex flex-col gap-4" data-setup-step={step}>
		{#if step === 'connect'}
			<ConnectStep
				{consent}
				{refusal}
				{holdsTursoAuthority}
				{isBusy}
				{isConnecting}
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
			<p class="text-center text-sm text-muted-foreground">{working}</p>
		{/if}
	</div>

	{#snippet foot()}
		<WayInPreferences />
	{/snippet}
</WayInSurface>
