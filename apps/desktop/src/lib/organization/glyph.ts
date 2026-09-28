import BanknoteIcon from '@lucide/svelte/icons/banknote';
import CircleUserIcon from '@lucide/svelte/icons/circle-user';
import DoorOpenIcon from '@lucide/svelte/icons/door-open';
import EyeIcon from '@lucide/svelte/icons/eye';
import HouseIcon from '@lucide/svelte/icons/house';
import KeyRoundIcon from '@lucide/svelte/icons/key-round';
import LayoutGridIcon from '@lucide/svelte/icons/layout-grid';
import PlusIcon from '@lucide/svelte/icons/plus';
import ScrollTextIcon from '@lucide/svelte/icons/scroll-text';
import ShieldIcon from '@lucide/svelte/icons/shield';
import ShieldUserIcon from '@lucide/svelte/icons/shield-user';
import SquarePenIcon from '@lucide/svelte/icons/square-pen';
import StampIcon from '@lucide/svelte/icons/stamp';
import TextCursorInputIcon from '@lucide/svelte/icons/text-cursor-input';
import Trash2Icon from '@lucide/svelte/icons/trash-2';
import UserCogIcon from '@lucide/svelte/icons/user-cog';
import UserIcon from '@lucide/svelte/icons/user';
import UserMinusIcon from '@lucide/svelte/icons/user-minus';
import UserPenIcon from '@lucide/svelte/icons/user-pen';
import UserPlusIcon from '@lucide/svelte/icons/user-plus';
import UsersIcon from '@lucide/svelte/icons/users';

import { verbOf, type RecordKind } from '$lib/organization/role';
import type { Flag } from '@rentable/workspace-permission';

/**
 * The glyph each kind of record is drawn with wherever a role's permissions are shown: the switch
 * list's groups (effort 838, requirement 12 as amended 2026-09-27). The house, the unit grid of
 * the complexes row, the person, the scroll and the banknote a contract's payments are drawn with
 * are the ones each kind already has ([[rules/frontend]]: a concept keeps one glyph everywhere it
 * appears), and the organization's people stand for the administration.
 * *The coins are the dashboard's outstanding figure, not a payment.*
 */
export const KIND_GLYPH = {
	complex: HouseIcon,
	unit: LayoutGridIcon,
	tenant: UserIcon,
	contract: ScrollTextIcon,
	payment: BanknoteIcon
} as const satisfies Record<RecordKind, typeof HouseIcon>;

/** the administration's glyph: the organization's people. */
export const ADMINISTRATION_GLYPH = UsersIcon;

/**
 * one member of the organization, where a list draws people rather than records: an account, so
 * the account section's glyph. The plain person is the tenant's (`KIND_GLYPH.tenant`, the tenants
 * page), and a member is not a tenant.
 */
export const MEMBER_GLYPH = CircleUserIcon;

/**
 * The glyph each permission's row in the switch list leads with (effort 838, requirement 12 as
 * amended a fourth time 2026-09-28). A kind of record's four are the verbs' glyphs, the ones the
 * application's own acts carry: the eye, the plus every create takes, the pen every edit takes and
 * the bin every delete takes. The organization's ten are each what the person acts on: a member
 * let in or out, a name changed, a password's key, a workspace's door, a role's shield, and the
 * seal the mark prints.
 */
const VERB_GLYPH = {
	view: EyeIcon,
	create: PlusIcon,
	edit: SquarePenIcon,
	delete: Trash2Icon
} as const;

const ADMINISTRATION_FLAG_GLYPH: Partial<Record<Flag, typeof EyeIcon>> = {
	inviteMember: UserPlusIcon,
	removeMember: UserMinusIcon,
	assignRole: ShieldUserIcon,
	renameWorkspace: TextCursorInputIcon,
	resetPassword: KeyRoundIcon,
	renameMember: UserPenIcon,
	grantWorkspace: DoorOpenIcon,
	manageRoles: ShieldIcon,
	overrideMember: UserCogIcon,
	manageMark: StampIcon
};

/** the glyph a permission's row leads with. */
export const flagGlyph = (flag: Flag): typeof EyeIcon => {
	const verb = verbOf(flag);

	return verb ? VERB_GLYPH[verb] : (ADMINISTRATION_FLAG_GLYPH[flag] ?? ShieldIcon);
};
