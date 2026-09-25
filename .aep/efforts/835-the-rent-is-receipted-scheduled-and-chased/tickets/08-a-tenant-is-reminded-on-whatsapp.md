---
status: open
blocked-by: [07]
---

# feat(contract): a tenant is reminded on WhatsApp

## Outcome

A `contract.remind` act, offered on a contract in *overdue*, *owing* or *due soon* wherever contract
acts are, opens WhatsApp addressed to the tenant with the message already written in the language
the application is showing.

## Acceptance Criteria

Traces requirement 12 of [[efforts/835-the-rent-is-receipted-scheduled-and-chased/spec]], and its
criterion 12.

- [ ] `contract.reminder({ id })` returns the name, phone, units, amount and date
      ([[efforts/835-the-rent-is-receipted-scheduled-and-chased/plan]], *Components*,
      `contract/router.ts`), with a router test for each of the three ranks.
- [ ] `toWhatsAppUrl` builds `https://wa.me/<number>?text=<message>` with the `+` stripped and the
      message URL-encoded, and the message names tenant, amount, date and units in Arabic and in
      English (criteria 12(a) and 12(b), `contract/tests/reminder.test.ts`).
- [ ] `contract.get` returns `rank`. The act applies only to the three ranks, and is absent on a
      contract in no rank or a terminated one (criterion 12(c), acts test).
- [ ] The landing row carries the act as it carries renew, and the host opens the URL through the
      opener.

## Relevant areas

- `apps/desktop/src/lib/contract/acts.ts`, `host.svelte.ts`, `component/host.svelte`, `router.ts`,
  `serialize.ts`
- `apps/desktop/src/lib/dashboard/component/section.svelte` (where the renew act is placed)
- `apps/desktop/src/lib/platform/tauri.ts` (`opener.openUrl`)

## Constraints

- The application sends nothing and records nothing about a reminder.
- The phone is a machine string, shown with `dir="ltr"` wherever it appears ([[rules/frontend]],
  *i18n*).
