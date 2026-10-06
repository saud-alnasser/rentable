---
use-when: "building or reviewing refunds in effort 854: how comparable rent tools and Saudi practice return money to a tenant"
---

# Question

How do comparable rent trackers and standard accounting practice record money the landlord
returns to a tenant (a refund) as distinct from a payment received, an expense, a fee, or a
deposit return? What does a refund do to the tenant's balance, what amount limits it, how do
reports show it, and what document does it produce?

# Sources

All read 2026-10-06. "Primary" means the vendor's own help centre or the authority's own page.

- Rentec Direct, "Tenant Refunds": https://help.rentecdirect.com/article/647-tenant-refunds (primary)
- DoorLoop, "Refund a payment to a tenant on an active lease": https://support.doorloop.com/en/articles/6184359-refund-a-payment-to-a-tenant-on-an-active-lease (primary)
- TenantCloud, "How do I refund money to my tenant": https://support.tenantcloud.com/en/articles/11955794-how-do-i-refund-money-to-my-tenant (primary)
- Landlord Studio, "How to log returned deposits": https://help.landlordstudio.com/en/articles/3906708-how-to-log-returned-deposits (primary)
- Buildium help articles: "How do I issue a refund to a tenant?" https://buildium.my.site.com/HC/s/article/How-do-I-issue-a-refund-to-a-tenant-1557492523066, "How do I reverse a tenant payment?" https://help.buildium.com/hc/s/article/How-do-I-reverse-a-tenant-payment-1557495016983, "Giving credits to tenants" https://help.buildium.com/hc/s/article/Giving-credits-to-tenants-1557495177538. **The pages render client-side and returned no body.** Only search-result snippets were seen; treat as weak.
- Reapit, "Tenant repayment / refund": https://reapit.atlassian.net/wiki/spaces/RW/pages/1790771201 (primary, body truncated on fetch; only the search-engine extract was seen, weak)
- REGA, "Termination of residential and commercial contracts": https://rega.gov.sa/en/rega-services/eservices/termination-of-residential-and-commercial-contracts-unilateral-termination/ (primary)
- Trowers & Hamlins, "Saudi Arabia - Landlord and Tenant" (Aug 2025): https://www.trowers.com/insights/2025/august/saudi-arabia---landlord-and-tenant (**secondary**, law-firm summary of the Ejar form)
- Ejar English tenancy contract PDF: https://www.ejar.sa/sites/default/files/English_Ejar_Tenancy%20Contract_v1.pdf (**403, not read**)
- AccountingTools, "Accounting for unearned rent": https://www.accountingtools.com/articles/accounting-for-unearned-rent.html (secondary reference text)
- Wafeq, سند الصرف vs سند القبض: https://www.wafeq.com/ar/تعلم-المحاسبة/accounting-principles-and-concepts/الفرق-بين-سند-الصرف-وسند-القبض-في-النظام-المحاسبي (Saudi accounting vendor, secondary)
- Daftra, شرح طريقة إنشاء سند صرف: https://www.daftra.com/blog/tutorials/شرح-طريقة-إنشاء-سند-صرف/ (Gulf accounting vendor, secondary)

# Findings

## 1. How money back is modelled

- **source** DoorLoop has its own transaction, "Give Refund", on the lease's Transactions tab. The
  tenant sees the word "Refund" on their ledger. The refund is booked against the same account as
  the original payment ("rent refunds use the Rent account, late fee refunds use Late Fees") and
  the money comes out of a chosen "Pay From Account". (DoorLoop link)
- **source** TenantCloud refunds *a specific recorded payment*: the payment's status becomes
  "Refunded" and a new refund record is added. (TenantCloud link)
- **source** Rentec Direct has no refund type. The landlord posts an *expense* with the tenant as
  payee, then recategorises it to the original income category (e.g. 4000 Rental Income) so that
  it reverses income. Rentec separates this from "Returning a Tenant Deposit". (Rentec link)
- **source** Landlord Studio records a returned deposit as a **negative payment** ("enter a
  negative amount"). Alternatively the landlord keeps part of the deposit by logging it as an
  expense "payable by the tenant". (Landlord Studio link)
- **source (snippet only)** Buildium's "issue a refund" covers both the security-deposit return at
  lease end and overpayments, and it keeps "reverse a tenant payment" (a bounced cheque, optionally
  with an NSF fee) separate from both. (Buildium links, weak)
- **interpretation** Every vendor that has a dedicated refund keeps it apart from an *expense*
  (money spent on the property) and from a *charge or fee* to the tenant. Rentec only reaches that
  outcome by recategorising an expense to income. The vendors also keep a refund apart from a
  *reversal*, which voids a payment that never cleared.

## 2. Effect on the balance; dependence on lease state and credit

- **source** DoorLoop: when the refund is for an overpayment, a toggle "creates a charge to offset
  the overpayment", because "there needs to be a charge associated with the money you're giving
  back". (DoorLoop link)
- **source** TenantCloud: after a refund "the invoice balance will be changed for the refunded
  amount", which means the invoice reopens. To return only part of a payment, TenantCloud tells the
  landlord to add a *credit* and apply it to future invoices instead. (TenantCloud link)
- **source** Rentec: the refund belongs "in the ledger(s) where the income was initially
  documented"; the reason it gives most often is an overpayment. (Rentec link)
- **source** DoorLoop allows refunds "on an active or inactive lease" and documents no difference
  between the two. (DoorLoop link)
- **source (snippet)** Reapit refunds "unallocated monies" only. It "will attempt to settle any
  outstanding invoices, and release the balance". (Reapit link, weak)
- **interpretation** Two models appear. (a) *Net*: the refund lowers what counts as paid, so if
  the refund was not covered by a credit, the tenant owes again (TenantCloud; DoorLoop without the
  toggle). (b) *Credit-only*: a refund draws down a surplus and cannot create debt (Reapit;
  DoorLoop with the toggle, which adds a charge to soak up the refund).

## 3. Can a refund exceed what was received? Guards

- **source** TenantCloud allows only the full amount of one income payment ("You cannot return a
  partial amount"; "Only income payments can be refunded"). Deposits go through a separate flow.
  (TenantCloud link)
- **source (snippet)** Re-leased/Reapit: "It is only possible to refund a payment if there are
  available funds on the ledger balance." (search extract of the Re-leased link, weak)
- **observation** No vendor documents a refund larger than the total received. DoorLoop and Rentec
  document no limit at all.

## 4. Reports

- **source** Rentec and DoorLoop book the refund to the original income account, so the reports
  show it as reduced income, i.e. *net*. (Rentec, DoorLoop links)
- **source** Landlord Studio's negative payment is netted the same way. Its advice is to exclude
  the "Deposit" category from dashboard filters so that deposits do not inflate income.
  (Landlord Studio link)
- **source** Accrual accounting holds rent received ahead as a liability (unearned rent) until
  it is earned. On a cash basis it is income at once. (AccountingTools link)
- **observation** No vendor page I read describes a separate "refunds" line beside gross collected.

## 5. Document

- **source** Rentec: electronic refunds are not offered. The refund's method is Check, Print
  Check or Other. (Rentec link)
- **source** سند صرف documents money paid out of the business. Its fields include a number, date,
  recipient, amount in figures and words, cheque number, reason, and the signatures of the cashier
  and the recipient. سند قبض documents money received. (Daftra, Wafeq links)
- **source** Wafeq lists a separate "استلام استرداد" (refund) option when a payment voucher is
  created for a customer refund. (Wafeq link, as summarised on fetch)
- **observation** None of the property tools I read documents a printable refund receipt.

## 6. Terminated leases and Saudi practice

- **source (secondary)** Under the Ejar unified contract, a lease ends in some no-fault situations
  such as force majeure, "in which latter case any rent paid attributable to the remaining term is
  to be returned". Security deposits are capped at 5% of the total lease value. At the end of the
  lease, "the parties will agree on the value of any damages" and the deposit funds are divided
  between them. (Trowers link)
- **source** Ejar's termination service includes a step for "Financial settlement (choose to
  settle all payments or select a specific payment for the tenant)". (REGA link)
- **source (secondary, search extract)** In a voluntary early exit, the tenant generally owes rent
  to the end of the term unless the landlord waives it. (lifeinsaudiarabia.net, via search; weak)
- **interpretation** Whether money goes back on early termination depends on the cause and on
  what the parties agree. It is a settlement amount, not something the schedule computes.

# Conclusion (findings only)

Comparable tools record money back as **its own transaction, tied to a lease and usually to the
income it reverses**. None uses a negative ordinary payment, except Landlord Studio for deposits.
They keep it apart from expenses, fees and payment reversals. They split on the balance: some net
it (and so reopen a balance), others limit it to a credit or unallocated surplus. Reports show it
as reduced income. Saudi accounting names the outgoing document سند صرف. Ejar's refund on
termination depends on the cause and is settled by the parties.

## Options for this app (inference for the orchestrator; not a decision)

1. **Model.** (a) A distinct *refund* record on the contract, beside payments: clearest, matches
   DoorLoop and Buildium, and needs a new entity. (b) A negative payment: least schema change, but
   allocation oldest-first breaks on negatives and the receipt would print a سند قبض for money paid
   out. (c) Refund a specific payment, as TenantCloud does: simple, but it cannot return part of a
   payment. Expenses and fees are a separate concept in every source; adding them is a separate
   scope.
2. **Balance.** (a) Net: paid = received minus refunded, so a refund can reopen outstanding.
   Honest arithmetic, but a refund after early termination would make a locked contract look
   owing. (b) Credit-only: a refund may only draw on the amount by which the payments exceed the
   total cost (the credit). It never creates debt, which suits overpayments, but it does not fit an
   early termination where the cycles were never re-cut. A terminated contract may need its own
   settlement rule, because termination currently locks payment changes.
3. **Guard.** At minimum, a refund must not exceed total received minus prior refunds. A stricter
   option limits it to the credit (Reapit, Re-leased).
4. **Reports.** (a) Net collected only (all vendors read). (b) Gross collected plus a refunds line,
   which keeps "collected" comparable with the receipts. No source shows (b), but nothing argues
   against it.
5. **Document.** Print a سند صرف for a refund, mirroring the سند قبض, with the reason and the
   recipient's signature line. Alternatively print nothing, as the property tools read here do.

# Not checked

- Buildium, AppFolio, Stessa, Avail, RentRedi, Hemlane help bodies: JS-rendered or not found;
  AppFolio and Stessa refund docs were not located at all.
- The Ejar contract text itself (403). Mogara, Rentoo and other Gulf apps were not searched.
- Saudi Civil Transactions Law provisions on early termination; the claim of rent owed to term-end
  is from a weak secondary source.
- ZATCA treatment of rent refunds (credit notes) for VAT-registered commercial lessors.
