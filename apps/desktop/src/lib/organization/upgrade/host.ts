/**
 * THE UPGRADE'S PART OF THE ORGANIZATION HOST
 *
 * what the organization asks of the shell about upgrading its data, and what it speaks in (effort
 * 857, ticket 07): the organization or one workspace upgraded by somebody holding `upgradeData`,
 * having seen whom it stops. Composed into the organization's port, `OrganizationHost` in
 * `../host.ts`, which re-exports these types; `../tauri.ts` is the adapter for the whole port.
 *
 * Nothing in this file imports a `@tauri-apps` package, for the reason `$lib/platform/host` gives.
 */

/** what is upgraded: the organization, or one workspace by its id. */
export type UpgradeTarget = 'organization' | { workspace: string };

/**
 * one step the upgrade would run, by the key of the sentence that says what it adds or changes:
 * `organization.upgrade.steps.<describes>` in both locales.
 */
export type UpgradeStep = { describes: string };

/** one machine the upgrade would stop or make read-only. */
export type UpgradeMachine = {
	/** the username of the member signed in on it; `null` where nobody is. */
	member: string | null;
	/** what its operating system calls it; `null` on one that has not said. */
	name: string | null;
	/**
	 * the version of rentable it runs; `null` on a machine that has never recorded it, a version
	 * before the one that records it: an unknown version.
	 */
	rentable: string | null;
	/** when it last said it was here, in milliseconds since the epoch. */
	seenAt: number;
};

/** what an upgrade would do, for whoever is about to choose it (effort 857, requirement 3). */
export type UpgradePreview = {
	/** the steps it would run, in order; none where nothing waits. */
	steps: UpgradeStep[];
	/** the machines seen within seven days it would stop: they could no longer open it. */
	stopped: UpgradeMachine[];
	/** the machines seen within seven days it would make read-only. */
	readOnly: UpgradeMachine[];
	/** the machines it would stop or make read-only that were not seen within seven days. */
	unseen: UpgradeMachine[];
	/** whether a step needs the owner's own key, so it waits for the owner whoever asks. */
	needsOwner: boolean;
};

/**
 * one step waiting for the upgrade (ticket 08): its number on its ladder, which a capability gated
 * on it names, and whether it needs the owner's own key, which decides who can run it.
 */
export type AwaitingStep = { number: number; needsOwner: boolean };

/**
 * what waits for the upgrade (ticket 08): the organization's steps, and each workspace's the
 * member holds, by its id. An empty list is a target with nothing waiting.
 */
export type UpgradeAwaiting = {
	organization: AwaitingStep[];
	workspaces: Record<string, AwaitingStep[]>;
};

/**
 * the upgrade of the organization or of one workspace. Both are `upgradeData`'s, and before the
 * owner has opened this version of rentable nobody but the owner's (`ownerNotUpdated`); Rust
 * refuses each by name.
 */
export type UpgradeHost = {
	/**
	 * what waits for the upgrade on the organization and on each workspace the member holds, read
	 * by any member: a capability gated on a step says why to whoever meets it (ticket 08).
	 */
	awaiting: () => Promise<UpgradeAwaiting>;
	/** what the upgrade of `target` would run, and whom it would stop or make read-only. */
	preview: (target: UpgradeTarget) => Promise<UpgradePreview>;
	/**
	 * run the upgrade of `target`, whole or not at all, with a copy taken first. Refuses a step
	 * needing the owner's key to anybody else (`upgradeNeedsOwner`) and an upgrade while another
	 * member's holds the lease (`upgradeUnderWay`), each with nothing changed.
	 */
	run: (target: UpgradeTarget) => Promise<void>;
};
