import assert from 'node:assert/strict';
import { mock, test } from 'node:test';

/**
 * THE ROLE WRITES, AS THEY CROSS
 *
 * Effort 838, requirements 4 to 6: each write the roles block, the role editor and a member's card
 * make reaches the one Tauri command that performs it, with the arguments Rust names. The shell is
 * not here, so `invoke` is stood in for and what it was asked is read back. The override crosses as
 * `overrideMask`, since Rust keeps `override` as a word of its own; with a role it crosses as `null`
 * where none rides along, which Rust reads as the override the member carries.
 *
 * *`member_assign_role` and `member_set_override` were reached through one bridge that ran both
 * and could half-apply, until ticket 11 of effort 838 gave each write its own call.*
 */

const asked: { command: string; args: unknown }[] = [];

mock.module('@tauri-apps/api/core', {
	exports: {
		invoke: async (command: string, args?: unknown) => {
			asked.push({ command, args });

			return undefined;
		}
	}
});
mock.module('@tauri-apps/api/event', { exports: { listen: async () => () => {} } });
mock.module('@tauri-apps/plugin-dialog', {
	exports: { open: async () => null, save: async () => null }
});
mock.module('@tauri-apps/plugin-opener', {
	exports: { openUrl: async () => {}, revealItemInDir: async () => {} }
});
mock.module('@tauri-apps/plugin-updater', { exports: { check: async () => null } });

const { tauri } = await import('$lib/platform/tauri');

test('each role write reaches its own command, with the arguments Rust names', async () => {
	asked.length = 0;

	await tauri.organization.roles();
	await tauri.organization.role.create('collector', 8, 'manager');
	await tauri.organization.role.rename('role-7', 'supervisor');
	await tauri.organization.role.setMask('role-7', 16);
	await tauri.organization.role.move('role-7', 'role-3');
	await tauri.organization.role.remove('role-7');
	await tauri.organization.member.assignRole('member-2', 'role-7');
	await tauri.organization.member.assignRole('member-2', 'role-7', 0);
	await tauri.organization.member.setOverride('member-2', 32);
	await tauri.organization.member.create('sami', 'role-7', 64, []);

	assert.deepEqual(asked, [
		{ command: 'organization_roles', args: undefined },
		{
			command: 'role_create',
			args: { name: 'collector', mask: 8, afterRoleId: 'manager' }
		},
		{ command: 'role_rename', args: { roleId: 'role-7', name: 'supervisor' } },
		{ command: 'role_set_mask', args: { roleId: 'role-7', mask: 16 } },
		{ command: 'role_move', args: { roleId: 'role-7', afterRoleId: 'role-3' } },
		{ command: 'role_delete', args: { roleId: 'role-7' } },
		{
			command: 'member_assign_role',
			args: { memberId: 'member-2', roleId: 'role-7', overrideMask: null }
		},
		{
			command: 'member_assign_role',
			args: { memberId: 'member-2', roleId: 'role-7', overrideMask: 0 }
		},
		{ command: 'member_set_override', args: { memberId: 'member-2', overrideMask: 32 } },
		{
			command: 'member_create',
			args: { username: 'sami', roleId: 'role-7', overrideMask: 64, workspaces: [] }
		}
	]);
});
