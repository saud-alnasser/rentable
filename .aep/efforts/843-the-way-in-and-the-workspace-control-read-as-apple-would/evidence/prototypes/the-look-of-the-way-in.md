---

---

# What do the way in and the workspace menu look like, drawn as one surface?

Verified against: Svelte 5 / SvelteKit 2, Tauri 2, `@rentable/design` primitives, in the running
desktop application launched from this effort's worktree, 2026-09-30 to 2026-10-01

Conclusion: **one column under a fixed mark, the step's position above its title, labelled fields
with no glyphs, one full-width prominent button, the welcome's two ways in as a stacked equal
pair, and every word plain.** The human chose the welcome's look on screen, then rewrote the
flow's words and took the Turso facts off the connect step; the rest was picked by the
orchestrator on the human's instruction to "pick and finish the prototype".

Consumed: [[rules/module-layout]], under *Prototype code*; [[skills/prototype/ui]];
[[efforts/843-the-way-in-and-the-workspace-control-read-as-apple-would/evidence/research/what-apple-does-for-the-way-in-and-the-workspace-control]].

## What was built

One design per surface, no layout options (the human's standing direction), in
`apps/desktop/src/lib/prototype/way-in/`, untracked, mounted under `dev` in
`startup/component/root.svelte` (which drew the way-in looks on the bare frame, the titlebar and
window controls alone) and in `workspace/component/rail-row.svelte` (the menu). The switcher bar
cycled eight looks: the application as it is, the welcome, Turso step 1 and 2, link step 1 and 2,
the wall, the workspace menu. Steps moved with a same-document view transition, the contents
sliding the reading direction's way and the mark holding still. Nothing wrote, except the foot's
language control, which set the locale.

## What was shown

Screenshots of the welcome, Turso steps 1 and 2 and link steps 1 and 2 in English and Arabic,
light and dark, at the default window size (1124x824), with the current welcome beside them.

**The wall and the workspace menu were built but never drawn on real data.** The worktree's
launch holds no organization, the human chose to connect it themselves and then asked for the
prototype to be finished without doing so. Both are judged in ticket 11's walk, on the human's own
organization.

## What the human decided, in order

1. **The welcome's look** ("2/5 is the best"): the mark, "rentable" in lower case, one line, and
   the two ways in as stacked, full-width buttons of one size, each a label over one short line,
   the Turso one prominent and the link one outlined. It beat the current card, which put a titled
   box with icon buttons inside a disabled rail.
2. **The link path stays on the same surface** and says nothing about Turso ("use link should be
   in the same onboarding not using the old form"). It became two steps, link and code, then the
   password, positioned like the first run.
3. **The Turso path starts with a connect step** ("connect to turso connect"), then the name step.
4. **More room at the top, twice, and around the back control.** The column starts at
   `max(5rem, 20vh)`; back sits 1rem in from the content area's top-start corner.
5. **Plain, simple words throughout** ("make it more plain and simply"), and **"before you
   connect" goes** ("feels odd"): the connect step's disclosure of three Turso facts is replaced by
   one line under the button.
6. **"Can't sign in?" answers with one sentence**: ask a manager or the owner for help.

## What the orchestrator picked, on the human's word

- **The position sits above the title**, as a small line ("step 1 of 2"), not between the
  description and the fields as the plan put it: it is read first, and the title stays the
  largest thing under the mark.
- **The mark is placed from the top, not centred**, so it and the title hold still when a step's
  contents change height.
- **Back is in the content area's corner, not the column's**: at 640 wide a column-corner arrow
  floats in the middle of the window.
- **Fields are 2.25rem high, labels above, hints in extra-small muted text.**
- **Disconnect and "use a link" leave the wall's disclosure for the foot control's popover**, shown
  only on the wall, because the human made "can't sign in?" a sentence and 824 requirement 20 still
  needs disconnect reachable from the wall.
- **The workspace menu as built**: the mark tile and the name on one line with the up-down
  chevron; the held workspaces as radio rows with a check at the start of the open one; a
  separator; "manage workspaces…" with an ellipsis, since it opens more (HIG *Menus*).
- **The three Turso facts leave the way in** (the group the consent covers, one organization to a
  group, one group on a free account), at the human's word. The strings go from the connect step;
  whether any of them belongs elsewhere is not decided here.

## The words

Lower case per [[rules/frontend]]; headings raised by `first-letter:uppercase`, except "rentable".

| Step | Title | Line | Fields | Actions |
| --- | --- | --- | --- | --- |
| welcome | rentable | track rent, receipts and reminders. | | **set up with Turso** / for the owner of the organization. · join with a link / for anyone who was sent a link. |
| Turso 1 of 2 | connect Turso | your organization is stored in your Turso account. | | **connect**, then "your browser opens so you can allow access." |
| Turso 2 of 2 | name your organization | you'll sign in with this username and password. | organization name · username · password (at least 12 characters.) | **create organization** |
| link 1 of 2 | join with a link | paste the link and enter the code you were given. | link · code (6 characters.) | **continue** |
| link 2 of 2 | choose a password | you'll use it to sign in. it can't be recovered. | password (at least 12 characters.) · confirm password | **join** |
| wall | the organization's name | sign in to continue. | username · password | **sign in** · can't sign in? → ask a manager or the owner of your organization for help. |
| menu | | | | the held workspaces, ✓ on the open one · manage workspaces… |

Arabic, as shown: تابع الإيجارات والإيصالات والتذكيرات. · ابدأ بحساب Turso / لمالك المؤسسة. ·
انضم برابط / لمن وصله رابط. · اربط Turso / تُحفظ مؤسستك في حساب Turso الخاص بك. / اربط / يفتح
المتصفح لتسمح بالوصول. · سمِّ مؤسستك / ستسجّل الدخول باسم المستخدم وكلمة المرور هذين. · انضم برابط
/ الصق الرابط وأدخل الرمز الذي وصلك. · اختر كلمة مرور / ستسجّل الدخول بها، ولا يمكن استعادتها. /
أكّد كلمة المرور / انضم · سجّل الدخول للمتابعة. / لا تستطيع تسجيل الدخول؟ / اطلب المساعدة من مدير
أو من مالك مؤسستك. · إدارة مساحات العمل…

## What changed downstream

Tickets 02, 04, 05, 06, 07 and 09 were corrected in the same commit as this file. The prototype
and its two mounts were removed in that commit too; the switcher stays.
