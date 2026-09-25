---
status: open
blocked-by: [14]
---

# feat(desktop): the mark is set in settings and printed

## Outcome

The organization section of settings shows the mark and, for the owner and administrators, lets
them choose an image or remove it; every receipt and schedule prints it at the foot.

## Acceptance Criteria

Traces requirement 13 of [[efforts/835-the-rent-is-receipted-scheduled-and-chased/spec]].

- [x] The owner or an administrator sees *choose image* and *remove*; a member sees the image and
      no control (criterion 13(b), component test).
- [x] A refused image is answered with the host's sentence (criterion 13(d), component test).
- [x] With a mark, the receipt and the schedule draw it at the foot; with none, the foot is empty
      (criterion 13(e), component tests).
- [x] Labels in both locales; the i18n suites pass.
- [ ] By hand: a mark chosen on one machine prints on a receipt from another member's machine
      (criterion 13(c)). Held for the close of the run.
