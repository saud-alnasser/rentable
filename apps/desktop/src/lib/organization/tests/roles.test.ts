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

const { tauri } = await import('$lib/organization/tauri');

test('each role write reaches its own command, with the arguments Rust names', async () => {
	asked.length = 0;

	await tauri.roles();
	await tauri.role.create('collector', 8, 'manager');
	await tauri.role.rename('role-7', 'supervisor');
	await tauri.role.setMask('role-7', 16);
	await tauri.role.move('role-7', 'role-3');
	await tauri.role.remove('role-7');
	await tauri.member.assignRole('member-2', 'role-7');
	await tauri.member.assignRole('member-2', 'role-7', 0);
	await tauri.member.setOverride('member-2', 32);
	await tauri.member.create('sami', 'role-7', 64, []);

	assert.deepEqual(asked, [
		{ command: 'plugin:organization|role_list', args: undefined },
		{
			command: 'plugin:organization|role_create',
			args: { name: 'collector', mask: 8, afterRoleId: 'manager' }
		},
		{ command: 'plugin:organization|role_rename', args: { roleId: 'role-7', name: 'supervisor' } },
		{ command: 'plugin:organization|role_set_mask', args: { roleId: 'role-7', mask: 16 } },
		{ command: 'plugin:organization|role_move', args: { roleId: 'role-7', afterRoleId: 'role-3' } },
		{ command: 'plugin:organization|role_delete', args: { roleId: 'role-7' } },
		{
			command: 'plugin:organization|role_assign',
			args: { memberId: 'member-2', roleId: 'role-7', overrideMask: null }
		},
		{
			command: 'plugin:organization|role_assign',
			args: { memberId: 'member-2', roleId: 'role-7', overrideMask: 0 }
		},
		{
			command: 'plugin:organization|role_set_override',
			args: { memberId: 'member-2', overrideMask: 32 }
		},
		{
			command: 'plugin:organization|invitation_member_create',
			args: { username: 'sami', roleId: 'role-7', overrideMask: 64, workspaces: [] }
		}
	]);
});
