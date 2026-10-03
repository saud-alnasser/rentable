---

---

# Question

What is each kind of component the design package holds for, when do established design systems
say not to use it, and what do they offer instead? Asked for the human's words of 2026-10-02:
"categorize the usage of each of the package/desgin components and when based on a reasrch on these
types of components then create a context in aep here to point to what to use on ui desgin"
(ticket 22 of [[efforts/846-the-settings-and-the-record-cards-are-rethought/spec]]).

Builds on, and does not repeat,
[[efforts/846-the-settings-and-the-record-cards-are-rethought/evidence/research/how-production-apps-organize-a-settings-section]]
(disclosure in a settings section, status on the row, destructive acts last) and the four
`settings-*-as-cards` files (what each settings tab looks like). Those answer *how a settings
section is laid out*; this answers *which kind of component a given need takes*, everywhere in
the application. What it found is written into [[contexts/desktop/components]].

# Sources

Read on 2026-10-02. Apple's pages were read through their JSON rendering
(`https://developer.apple.com/tutorials/data/design/human-interface-guidelines/<page>.json`), since
the HTML pages are drawn by script; Material 3's pages are drawn by script too, and only their own
page summaries (the `description` each page declares) were read.

**Apple Human Interface Guidelines** (first, by the human's standing direction):

- Buttons: https://developer.apple.com/design/human-interface-guidelines/buttons
- Toggles: https://developer.apple.com/design/human-interface-guidelines/toggles
- Segmented controls: https://developer.apple.com/design/human-interface-guidelines/segmented-controls
- Pop-up buttons: https://developer.apple.com/design/human-interface-guidelines/pop-up-buttons
- Pull-down buttons: https://developer.apple.com/design/human-interface-guidelines/pull-down-buttons
- Menus: https://developer.apple.com/design/human-interface-guidelines/menus
- Context menus: https://developer.apple.com/design/human-interface-guidelines/context-menus
- Combo boxes: https://developer.apple.com/design/human-interface-guidelines/combo-boxes
- Text fields: https://developer.apple.com/design/human-interface-guidelines/text-fields
- Labels: https://developer.apple.com/design/human-interface-guidelines/labels
- Popovers: https://developer.apple.com/design/human-interface-guidelines/popovers
- Sheets: https://developer.apple.com/design/human-interface-guidelines/sheets
- Alerts: https://developer.apple.com/design/human-interface-guidelines/alerts
- Modality: https://developer.apple.com/design/human-interface-guidelines/modality
- Disclosure controls: https://developer.apple.com/design/human-interface-guidelines/disclosure-controls
- Boxes: https://developer.apple.com/design/human-interface-guidelines/boxes
- Lists and tables: https://developer.apple.com/design/human-interface-guidelines/lists-and-tables
- Collections: https://developer.apple.com/design/human-interface-guidelines/collections
- Tab views: https://developer.apple.com/design/human-interface-guidelines/tab-views
- Sidebars: https://developer.apple.com/design/human-interface-guidelines/sidebars
- Path controls: https://developer.apple.com/design/human-interface-guidelines/path-controls
- Progress indicators: https://developer.apple.com/design/human-interface-guidelines/progress-indicators
- Gauges: https://developer.apple.com/design/human-interface-guidelines/gauges
- Loading: https://developer.apple.com/design/human-interface-guidelines/loading
- Feedback: https://developer.apple.com/design/human-interface-guidelines/feedback
- Offering help: https://developer.apple.com/design/human-interface-guidelines/offering-help
- Keyboards: https://developer.apple.com/design/human-interface-guidelines/keyboards
- Settings: https://developer.apple.com/design/human-interface-guidelines/settings

**Material 3** (second; page summaries only):

- https://m3.material.io/components/snackbar/overview, /dialogs/overview, /side-sheets/overview,
  /menus/overview, /chips/overview, /segmented-buttons/overview, /switch/overview,
  /checkbox/overview, /lists/overview, /cards/overview, /badges/overview,
  /progress-indicators/overview, /tooltips/overview, /navigation-rail/overview, /divider/overview,
  /buttons/overview, /icon-buttons/overview, /text-fields/overview, /date-pickers/overview,
  /tabs/overview

**Microsoft Fluent 2:**

- Switch: https://fluent2.microsoft.design/components/web/react/core/switch/usage
- Dialog: https://fluent2.microsoft.design/components/web/react/core/dialog/usage
- Message bar: https://fluent2.microsoft.design/components/web/react/core/messagebar/usage
- Tooltip: https://fluent2.microsoft.design/components/web/react/core/tooltip/usage
- Drawer: https://fluent2.microsoft.design/components/web/react/core/drawer/usage
- Skeleton: https://fluent2.microsoft.design/components/web/react/core/skeleton/usage

**shadcn/ui and shadcn-svelte** (the source of the primitive tree, [[references/shadcn-svelte]]):

- Item: https://ui.shadcn.com/docs/components/item
- Empty: https://ui.shadcn.com/docs/components/empty
- Sheet: https://shadcn-svelte.com/docs/components/sheet
- Command: https://shadcn-svelte.com/docs/components/command
- Badge: https://shadcn-svelte.com/docs/components/badge

**Radix and bits-ui** (the behaviour beneath the primitives):

- Alert Dialog: https://www.radix-ui.com/primitives/docs/components/alert-dialog
- Tooltip: https://www.radix-ui.com/primitives/docs/components/tooltip
- Collapsible: https://www.radix-ui.com/primitives/docs/components/collapsible
- Popover: https://www.radix-ui.com/primitives/docs/components/popover
- Toggle Group (bits-ui): https://bits-ui.com/docs/components/toggle-group

**IBM Carbon:**

- Modal: https://carbondesignsystem.com/components/modal/usage/
- Notification: https://carbondesignsystem.com/components/notification/usage/
- Toggle: https://carbondesignsystem.com/components/toggle/usage/
- Tooltip: https://carbondesignsystem.com/components/tooltip/usage/
- Empty states: https://carbondesignsystem.com/patterns/empty-states-pattern/

**GOV.UK Design System:**

- Details: https://design-system.service.gov.uk/components/details/
- Select: https://design-system.service.gov.uk/components/select/
- Radios: https://design-system.service.gov.uk/components/radios/
- Summary list: https://design-system.service.gov.uk/components/summary-list/
- Tag: https://design-system.service.gov.uk/components/tag/
- Notification banner: https://design-system.service.gov.uk/components/notification-banner/

**Atlassian Design System:**

- Lozenge: https://atlassian.design/components/lozenge/usage
- Section message: https://atlassian.design/components/section-message/usage

In the repository: every directory under `packages/design/src/lib/primitive/`, every file under
`packages/design/src/lib/block/`, `apps/desktop/src/lib/design/cell/` and
`apps/desktop/src/lib/design/block/`, each read for its doc comment, and an import search of
`apps/desktop/src/` for where each is drawn.

# Findings

One finding per kind of component the package holds. Each says what the sources agree it is for,
when they say not to use it, and what they offer instead.

## 1. Buttons: an act, named by its verb

- Apple, *Buttons*: "A button initiates an instantaneous action", and "use a button that has a
  prominent visual style for the most likely action in a view". Material 3, *Icon buttons*: they
  "help people take supplementary actions", "used when a compact button is required, such as in a
  toolbar".
- **Not for:** choosing among values (Apple's toggles, segmented controls and pop-up buttons are
  "button-like components" with their own pages), or a status (GOV.UK *Tag*: "Do not make a tag
  interactive by making it into a link or button").
- **Instead:** a toggle or segmented control where the press sets a state, a menu where one button
  would carry several related commands.

## 2. Menus: several commands behind one control

- Apple, *Pull-down buttons*: "present commands or items that are directly related to the button's
  action", with a minimum of three items, and "avoid putting all of a view's actions in one
  pull-down button", since "a view's primary actions need to be easily discoverable".
- Apple, *Context menus*: "access to functionality that's directly related to an item", "hidden by
  default, so people might not know it's there", so "always make context menu items available in
  the main interface, too". Keep submenus to one level.
- Apple, *Menus*: a menu item "may include a symbol" and can "display the associated keyboard
  command".
- **Not for:** a choice among exclusive values (Apple: "If you need to provide a list of mutually
  exclusive choices that aren't commands, use a pop-up button instead"); one or two items.

## 3. Choosing a value: switch, segmented control, select, combobox, checkbox

- **On or off.** Apple, *Toggles*: "choose between two opposing values that affect the state of
  content or a view", and on iOS "use the switch toggle style only in a list row". Fluent 2,
  *Switch*: "If you need a component that requires a submission step before applying a change, or
  if you need to specify an indeterminate state, try a checkbox." Carbon, *Toggle*: for "a single
  option that affects the system or page settings. Ideal for settings or preferences that can be
  immediately applied." Material 3: "Switches are the best way to let users adjust settings."
- **A few exclusive values.** Apple, *Segmented controls*: "closely related choices that affect an
  object, state, or view", which keep "their grouping regardless of the view size", and *Tab views*
  notes a pop-up button "requires two" presses where a tabbed control requires one and hides its
  choices. GOV.UK, *Radios*: "when users can only select one option from a list". bits-ui's toggle
  group is the same control in `single` mode ("only one item can be selected at a time").
- **A long list.** Apple, *Pop-up buttons*: "a flat list of mutually exclusive options", "when
  space is limited and you don't need to display all options all the time", with "a useful default
  selection". GOV.UK, *Select*: "a last resort", since "some users find selects very difficult to
  use"; ask questions that give "fewer options" first.
- **A value from a long, searched list, or a custom value.** Apple, *Combo boxes*: "a text field
  with a pull-down button", populated "with a meaningful default value from the list".
- **Several independent values.** GOV.UK, *Radios*: where "users might need to select more than one
  option ... use the Checkboxes component instead". Material 3: "Checkboxes let users select one or
  more items from a list."

## 4. Entering text and dates

- Apple, *Text fields*: "a small amount of information, such as a name or an email address"; "to
  let people input larger amounts of text, use a text view instead"; "match the size of a text
  field to the quantity of anticipated text"; a placeholder disappears, so keep "a separate label".
- Apple, *Labels*: uneditable text is a label; "if you need to let people edit a small amount of
  text, use a text field".
- Material 3, *Date pickers*: "select a date, or a range of dates".

## 5. Showing data: a list, a grid of cards, key facts

- Apple, *Lists and tables*: "Prefer displaying text in a list or table ... the row-based format is
  especially well suited to making text easy to scan"; *Collections*: "ideal for showing
  image-based content", "consider using a table instead of a collection for text", "use the
  standard row or grid layout whenever possible".
- Material 3, *Cards*: "content and actions about a single subject"; *Lists*: "help users find a
  specific item and act on it".
- GOV.UK, *Summary list*: "show information as a list of key facts"; "do not use it for tabular
  data or a simple list of information or tasks".
- shadcn/ui, *Item*: "displaying content with media, title, description, and actions"; use Field
  for form inputs, Item when presenting "titles, descriptions, and actions" without form
  functionality.

## 6. Showing status: a chip with a word, never a control

- GOV.UK, *Tag*: "when it's possible for something to have more than one status and it's useful
  for the user to know about that status"; "Use adjectives ... and not verbs"; never a link or
  button.
- Atlassian, *Lozenge*: for "workflow status ... system state ... permissions (Locked, Read only)";
  a badge is "for tallies or scores"; "avoid relying solely on color; include clear labels and
  supporting icons".
- Material 3, *Badges*: "notifications, counts, or status information on navigation items and
  icons". shadcn: a badge "displays a badge or a component that looks like a badge".
- Apple, *Feedback*: "display status information in a passive way so that people can view it when
  they need it", and *Gauges*: a value within a range, with "succinct labels".
- **Not for:** an act. A status with a problem to act on is a message (finding 7), not a tag.

## 7. Telling the reader something: callout, toast, alert

- **On the surface, until resolved.** Fluent 2, *Message bar*: "important information about the
  state of the entire product or the surface where it appears, such as a page, drawer, dialog, or
  card", with intents error, warning, success and info. Atlassian, *Section message*: "alert users
  to a particular section of the screen". Carbon, *Notification*: inline notifications "persist
  until dismissed or resolved"; a callout "cannot be dismissed".
- **After an event, briefly.** Material 3, *Snackbar*: "short updates about app processes".
  Carbon: a toast is "non-modal, time-based". Atlassian: a flag is "for messages that appear after
  an event takes place". Fluent 2's *Dialog* sends "feedback on a completed action that doesn't
  require user interaction" to a toast.
- **Interrupting.** Apple, *Alerts*: "Use alerts sparingly"; "Avoid using an alert merely to
  provide information"; "Avoid displaying alerts for common, undoable actions, even when they're
  destructive", but for "an uncommon destructive action that they can't undo, it's important to
  display an alert".
- **Not for:** validation. GOV.UK, *Notification banner*: "Do not use for validation errors"; and
  "use notification banners sparingly. There's evidence that people often miss them".

## 8. Interrupting and confirming: dialog, sheet, popover

- Apple, *Modality*: modal presentation is for critical information, confirming or modifying "their
  most recent action", or "a distinct, narrowly scoped task". Apple, *Sheets*: "a scoped task that's
  closely related to their current context"; "for complex or prolonged user flows, consider
  alternatives to sheets".
- Carbon, *Modal*: "critical information or request user input that's needed to complete a user's
  workflow"; avoid for "repetitive tasks" and "non-critical messaging"; a side panel for "complex,
  multi-step processes", a popover "for contextual information without blocking content".
- Fluent 2, *Dialog*: reserve it for "important actions"; *Drawer*: "supplemental info and simple
  actions related to the main content", and a dialog where "you need people to confirm an action".
- Radix, *Alert Dialog*: "A modal dialog that interrupts the user with important content and
  expects a response." shadcn-svelte, *Sheet*: "Extends the Dialog component to display content
  that complements the main content of the screen."
- Apple, *Popovers*: "expose a small amount of information or functionality", "limit the amount of
  functionality in the popover to a few related tasks", "always save work when automatically
  closing a nonmodal popover", "show one popover at a time". Radix: "rich content in a portal,
  triggered by a button".

## 9. Disclosing detail

- Apple, *Disclosure controls*: "hide details until they're relevant", the controls "people are
  most likely to use at the top ... always visible", with "a descriptive label". GOV.UK, *Details*:
  "information that only some users will need"; "do not use ... to hide information that the
  majority of your users will need". Radix, *Collapsible*: "expands/collapses a panel".
- Tooltips. Fluent 2: "supplemental, contextual information"; never "system feedback or error
  messages", "interactive content", or "essential information users need to complete a task".
  Carbon: "Do not include interactive elements within a tooltip", since "tooltips do not receive
  focus"; a toggletip or popover for those. Material 3: "brief labels or messages". Radix: shown on
  "keyboard focus or the mouse hovers". Apple, *Offering help*: "directly relate the help you
  provide to the precise action or task people are doing right now".

## 10. Guiding: empty states and help

- Carbon, *Empty states*: a title "where possible ... a positive statement", a body that "explains
  the next action", a primary action; three kinds: no data, user action (a search with no results),
  and error management. shadcn/ui, *Empty*: header (media, title, description) and content (the
  act).
- Apple, *Offering help*: "Avoid bloating your help content by explaining how standard components
  or patterns work."

## 11. Navigating

- Apple, *Sidebars*: "navigate between areas of your app or top-level collections of content".
  Material 3, *Navigation rail*: "3-7 destinations".
- Apple, *Tab views*: "closely related areas of content", "controls within a pane affect content
  only in the same pane", noun labels, no more than six tabs. Material 3, *Tabs*: "group content
  into helpful categories".
- Apple, *Path controls*: the path "of a selected file or folder", in the window body.
- Apple, *Keyboards*: standard and custom shortcuts for "the app-specific commands people use most".
- shadcn-svelte, *Command*: "Command menu for search and quick actions."

## 12. Laying out

- Apple, *Boxes*: "a visually distinct group of logically related information"; keep a box "small
  in comparison with its containing view"; "adding nested boxes to define subgroups can make your
  interface feel busy and constrained", so use "padding and alignment" inside a box instead.
- Material 3, *Divider*: "a thin line that groups content in lists and containers".

## 13. Feedback and progress

- Apple, *Progress indicators*: determinate "for a task with a well-defined duration",
  indeterminate "for unquantifiable tasks"; "when possible, use a determinate progress indicator".
- Apple, *Loading*: "Show something as soon as possible ... consider showing placeholder text,
  graphics, or animations".
- Fluent 2, *Skeleton*: for a known structure; "If you don't know the structure, try a progress bar
  or spinner"; skeletons say "something is happening, but not how long", so "avoid them for long
  processes".

# Confidence

High for findings 1 to 4, 6 to 9 and 13: at least three systems say the same thing in their own
words, and Apple's pages were read whole. Medium for 5 and 12, where the systems speak to web pages
and phones and the desktop window is this application's own case. Material 3 is cited by its page
summaries alone, so no Material claim above goes past what a summary says.

# Not checked

- Shopify Polaris: its component pages now redirect to `https://shopify.dev/docs/api/polaris`,
  which did not resolve to the component guidance; Carbon, GOV.UK and Atlassian were read instead.
- Material 3's full guidelines pages (drawn by script); only their summaries.
- Apple's *Badges* and *Date pickers* pages did not resolve under the JSON rendering.
- How any of this reads in Arabic; the systems above are written for left-to-right.
