/**
 * THE ORGANIZATION'S ENTRY
 *
 * what another concept may import of the organization under Node: a `rentable://` link handed on
 * to the join screen. What the window reads of it (where the machine stands, the first workspace's
 * create, the name and mark a printed page carries) is in `./ui`. The shapes its host port hands
 * over are here too, for the concepts that read what the window reads and for the composition
 * root, which binds the port.
 */
export { linkArrived } from './setup/connect';
export type { GatedStep } from './upgrade/upgrade';
export type {
	AwaitingStep,
	HeldByVersion,
	HeldOrganization,
	MigrationNotice,
	OrganizationHost,
	OrganizationMark,
	OrganizationMember,
	OrganizationSession,
	OrganizationState,
	OrganizationWorkspace,
	UpgradeAwaiting,
	UpgradeMachine,
	UpgradePreview,
	UpgradeStep,
	UpgradeTarget,
	VersionStanding
} from './host';
