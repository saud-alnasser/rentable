---

---

# What do this effort's on-screen checks show, staged?

Verified against: Svelte 5.56 / SvelteKit 2.70, sql.js 1.14, Chrome 154 headless at the desktop
window's 1124 by 824, through `pnpm stage:shots 861.` on the effort's tip, 2026-10-11

Conclusion: **all thirteen states reach their screen in English and Arabic, light and dark, with
nothing false on them.** Staging found one defect on the way, the date picker's weekday row in
Arabic and its squared selected day, fixed as ticket 29.

Consumed: [[rules/staging]]; [[references/stage]].

Every on-screen item under `## Needs you` is a state in `state/861.ts` of the effort's `_stage`
worktree, on mock records only. The run entered each in a fresh headless context, 48 shots in
all, and every one passed (52 once state 13 was added): each reached its screen, nothing threw, and no host but the stage
server was asked. One shot first failed to boot on a module the dev server dropped mid-run, and
passed with the rest of its state when shot again. Each screenshot was looked at; what it showed
follows, by the number the bar gives the state.

## 1. error toast stays (ticket 02)

A save the staged database refuses raises "unexpected error occurred!" through the app's own
path. It sits bottom right in English and bottom left in Arabic, and its text reads on the error
wash in light and dark. That it is still up after ten seconds is the owner's to watch in the
window. Its X stood at the toast's top start corner; on looking, the owner had it moved to the
top end corner, where the reading ends (top right in English, top left in Arabic), and the shots
were taken again. Pressing that X closed nothing: the open form's dialog had turned pointer events off
under the toaster. Fixed as ticket 30, a real click on it now closes the toast and leaves the
changed form open, with no discard question.

## 2. four toast tones (ticket 24)

Success, warning and info held up together and spread by a real pointer (the error is state
one). Each one's text and icon read on its 8% wash in light and dark, on the mirrored side in
Arabic.

## 3. destructive fill (ticket 01)

The delete question for a tenant with no contract: the red "delete" and "حذف" button carries a
white label that reads in all four.

## 4. permitted and primary fills (ticket 01)

The contract form's end date picker: the permitted days (26 to 30, then 1 to 5) are outlined
green, the selected 31 is a full green circle, and the primary Update button is filled blue. In
Arabic the weekday row reads ح ن ث ر خ ج س. No control wears a focus ring.

## 5. checked boxes and badges (ticket 01)

Contracts in selection: two checked boxes in the primary fill, the "2 selected" bar, the
Fulfilled, Scheduled and Active badges, and the rail's mark on Contracts, readable in light and
dark.

## 6. discard question (ticket 06)

A tenant form with a changed name, closed with a real Escape: "Discard Changes?" opens with keep
editing focused and its ring showing, beside a red discard. In Arabic the buttons are mirrored
and the ring is on متابعة التعديل.

## 7 to 11. each form, untouched (ticket 07)

The tenant form, the contract form for edit, renew and duplicate, and the payment form each open
filled and untouched, with no ring on their first control. Renew opens with its hint and the rent
carried over; duplicate opens filled from the contract; the payment form's remaining balance
equals the remaining after this payment, which is right for an unchanged edit. Closing each and
asking after a change is the owner's to do in the window, as the look line says.

## 12. landing, may view nothing (converge)

A member, `sam.member`, who may view no contracts, payments or units: the rail offers Dashboard,
Tenants and Complexes, and the main area was empty. Asked what it should show, the owner had it
say what is happening in its middle (ticket 32), in the words of permissions rather than roles:
it now reads "you have no permission to view anything here." over what the screen shows and that
someone who can edit your permissions can let you view it, centred in the window, in English and
Arabic.

## 13. undo on a toast (ticket 33)

Added after the owner found the undo and redo on a toast plain. A free tenant deleted through the
app's own question raises the success toast with undo: undo is a pill with its label and a hairline
in the toast's green, on the toast's wash, in English and Arabic, light and dark.

## What staging could not show

Nothing in this effort's list: none of its on-screen checks reaches past the shell. The questions
on the changelog's level and migration 0009 are not on-screen checks, and stay as they are.
