---
aep: 2.1.1
owner: repository
date: 2026-08-17
kind: rule
paths:
  - apps/desktop/src/lib/**/component/**
  - apps/desktop/src/lib/design/block/**
  - apps/desktop/src/lib/design/cell/**
  - apps/desktop/src/lib/design/primitive/**
  - apps/desktop/src/routes/**
  - apps/desktop/src/app.css
use-when: "designing or restyling a surface, a block, a cell, or a primitive"
---

<!--
  Path-scoped: the `paths:` frontmatter above is the authority, and the harness
  enforces it — this rule loads when a surface is read and costs nothing
  otherwise.
-->

# Interface design

_Refactoring UI_ (Adam Wathan & Steve Schoger) is this repository's reference for visual
design decisions. It sits at `.aep/position/design/refactoring-ui.pdf`, with a
navigation file beside it at `.aep/position/design/refactoring-ui.md`.

**It is a reference, not a standard.** It informs a decision that is otherwise a matter of
taste; it never overrides anything this repository has decided. Where it disagrees with
[[rules/frontend]], another rule, or a context, this repository wins and the book is not
argued with — precedence is [[policies/authority]]'s, and a reference ranks below all of it.

## When it is opened

Open it when a change decides what a surface **looks like**:

- a new screen, panel, card, or empty state
- a redesign, or a surface being reshaped rather than rewired
- a visual complaint with no obvious cause — *it looks noisy*, *nothing stands out*, *it
  looks plain*, *the spacing feels wrong*
- a choice between two treatments that both work

**Do not open it** for wiring, data, copy, a bug with a known cause, or a change that only
moves existing markup. A reference consulted on every change is a reference nobody reads.

## How it is used

**The navigation file first, always** — `refactoring-ui.md` beside the PDF. It routes a
question to the sections that answer it, gives both page numbers each section starts at
(the PDF's and the printed one, which differ), and carries the glossary.

**Then read the pages it routed to.** The book argues through before/after images that the
text only gestures at, so a section summarised is a section unseen — the navigation file
says which pages, and those pages get opened.

**Never work from memory of the book.** Recalling that it says something about shadows is
not reading what it says; a paraphrase invented at the point of use is a guess wearing a
citation. [[policies/engineering]] binds this everywhere, and it binds here.

**A decision that leans on it names the section** — in the comment, the commit message, or
the design document that carries the decision. "Softer icon colour to counterbalance its
weight (_Balance weight and contrast_)" is reviewable; "per Refactoring UI" is not.

## Where it is silent

The book was written for web pages in 2019. It has nothing to say about **bidirectional
layout, dark mode, motion, focus and keyboard affordances, accessibility beyond colour
contrast, desktop-window density, or text that changes length between locales** — every
one of which this application has. `refactoring-ui.md` lists them.

Those are exactly the areas this repository has already decided for itself, and its own
standards are the only home for them: **the book adds nothing to a question [[rules/frontend]]
or another rule already answers, and is not consulted on one.** A standard with two homes drifts
at one of them.

## When it is absent

The book and its navigation file are per-clone — `.aep/.gitignore` keeps the whole
`position/` directory out of version control, and a 55 MB licensed book does not belong in
a repository. So a fresh clone, another machine, and CI all have neither.

**Where the file is not there, say so and proceed on this repository's own standards.**
That is a working state, not a blocked one — this rule adds a reference, and every
standard that binds a surface is committed elsewhere.
