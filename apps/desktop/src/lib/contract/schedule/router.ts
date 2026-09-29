import * as s from '$lib/platform/database/schema';
import { ContractSchema } from '$lib/platform/database/schema';
import { refuse } from '$lib/api/refusal';
import { procedure, router } from '$lib/api/trpc';
import { getContractRank } from '$lib/contract/rank/rank';
import { selectContract, selectPaymentsForContract } from '$lib/contract/row';
import { permits } from '@rentable/workspace-permission';
import { eq } from 'drizzle-orm';
import { getReminderFigures, isReminderRank, type ContractReminder } from './reminder';
import { scheduleContract } from './schedule';

/**
 * A CONTRACT'S SCHEDULE, AND THE REMINDER READ FROM IT
 *
 * `contract.reminder` and `contract.schedule`, composed into the contract's router at its root.
 */

export default router({
	/**
	 * What a WhatsApp reminder to the contract's tenant states: the tenant's name and phone, the
	 * units, the amount and the date (`contract/schedule/reminder.ts`).
	 *
	 * Offered on a contract that is overdue, owing or due soon, and refused on any other: a
	 * contract that owes nothing and has nothing falling due has nothing to remind anyone of. It
	 * reads and writes nothing else; whether a reminder was sent is not recorded.
	 */
	reminder: procedure
		.permitted('viewContract')
		.input(ContractSchema.pick({ id: true }))
		.query(async ({ input, ctx }): Promise<ContractReminder> => {
			const now = ctx.clock.now();
			const contract = await selectContract(ctx.db, input.id);
			const { endingSoonNoticeDays } = await ctx.host.settings.get();
			const rank = getContractRank(contract, contract.paidAmount, now, endingSoonNoticeDays);

			if (!isReminderRank(rank)) {
				throw refuse('contract.nothingToRemind');
			}

			const payments = await selectPaymentsForContract(ctx.db, contract.id);
			const figures = getReminderFigures(contract, payments, rank, now);

			// the rank was decided on the same fields at the same instant, so a figure is always
			// there; the refusal stands in for a disagreement the rank rules out.
			if (!figures) {
				throw refuse('contract.nothingToRemind');
			}

			const reminder = { rank, contractNumber: contract.govId?.trim() ?? '', ...figures };

			// the tenant is named only to a member who may view tenants (effort 838, requirement 10),
			// and the interface does not offer a reminder to anyone else.
			if (!permits(ctx.identity.permissions, 'viewTenant')) {
				return reminder;
			}

			const tenant = await ctx.db
				.select({ name: s.tenant.name, phone: s.tenant.phone })
				.from(s.tenant)
				.where(eq(s.tenant.id, contract.tenantId))
				.get();

			if (!tenant) {
				throw refuse('contract.tenantMissing');
			}

			return { ...reminder, tenantName: tenant.name, tenantPhone: tenant.phone };
		}),

	/**
	 * A contract's schedule: one entry per cycle across its whole period, each with the day it
	 * falls due, what it costs, how much of that the payments cover, and its state today.
	 *
	 * Every payment against the contract is read, because the allocation takes them oldest first
	 * and a cycle's cover depends on every payment before it. Computed here on every read and
	 * stored nowhere (`contract/schedule/schedule.ts`). Dates cross as timestamps, as a contract's do.
	 */
	schedule: procedure
		.permitted('viewContract')
		.input(ContractSchema.pick({ id: true }))
		.query(async ({ input, ctx }) => {
			const contract = await selectContract(ctx.db, input.id);
			const payments = await selectPaymentsForContract(ctx.db, contract.id);
			const { cycles } = scheduleContract(contract, payments, ctx.clock.now());

			return cycles.map((cycle) => ({ ...cycle, due: cycle.due.getTime() }));
		})
});
