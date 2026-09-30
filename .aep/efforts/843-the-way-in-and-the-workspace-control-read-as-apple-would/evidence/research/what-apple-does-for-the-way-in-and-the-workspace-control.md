---
use-when: "reshaping the pre-sign-in screens or the workspace control at the head of the sidebar, and a requirement needs to say what Apple states or does"
---

# Question

What do Apple's primary sources say and show, concretely, for (1) first-run, setup and
sign-in screens, and (2) a control at the head of a sidebar that shows the current context
and switches it? Where do macOS conventions conflict with Windows (Fluent) expectations that
matter to a cross-platform Tauri app with a custom titlebar, English and Arabic, light and dark?

Scope held to what would change a requirement. Every finding is labelled **States** (a
sentence the source says), **Documents** (a product's own help page describing its own
surface), or **Infer** (my reading, not the source's). Nothing here is a recommendation.

# Sources

All read 2026-09-30. The HIG pages were read from Apple's own JSON render of each page
(`https://developer.apple.com/tutorials/data/design/human-interface-guidelines/<page>.json`),
which is the same content the public page renders. The HIG is a living document; each page's
own change log date is given where it bears on a finding. Public URL form:
`https://developer.apple.com/design/human-interface-guidelines/<page>`.

HIG pages, primary: `onboarding` (last change 2024-06-10), `launching` (2024-06-10),
`managing-accounts`, `sign-in-with-apple`, `entering-data` (2023-06-21), `text-fields`
(2023-06-05), `buttons` (2025-12-16), `layout`, `typography`, `writing` (2025-12-16),
`materials`, `motion`, `right-to-left`, `pop-up-buttons` (2023-10-24), `pull-down-buttons`
(2022-09-14), `menus` (2026-06-08), `sidebars` (2026-06-08), `toolbars`, `windows`, `sheets`,
`alerts` (2024-02-02), `privacy`, `disclosure-controls`, `progress-indicators`,
`page-controls`, `keyboards`, `focus-and-selection`, `designing-for-macos`.

Apple product documentation, primary for what each product does:

- Xcode, *Customizing the build schemes for a project*,
  `https://developer.apple.com/documentation/xcode/customizing-the-build-schemes-for-a-project`
- Xcode, *Creating an Xcode project for an app*,
  `https://developer.apple.com/documentation/xcode/creating-an-xcode-project-for-an-app`
- Apple Support, *Use profiles in Safari on Mac*, `https://support.apple.com/105100` (Safari 17+)
- Mac User Guide, *Sign in with your Apple Account*,
  `https://support.apple.com/guide/mac-help/mchla99dc8da/mac` (page references macOS 27)
- iMac User Guide, *Set up your iMac for new Mac users*,
  `https://support.apple.com/guide/imac/apd8072a27e6/2023/mac/14` (macOS 14 edition)
- Apple Support, *Set up Mac with iPhone or iPad*, `https://support.apple.com/122216`
- Mail User Guide, *mailbox* glossary, `https://support.apple.com/guide/mail/aside/glos8e4eb14f/mac`
- Notes User Guide, *View your notes*, `https://support.apple.com/guide/notes/apd8b73d28be/mac`
  (read through a search summary only; weaker)
- Apple Style Guide, *C* entries (capitalization),
  `https://support.apple.com/guide/applestyleguide/c-apsgb744e4a3/web`
- AppKit, `NSMenuItem.state`, `NSPopUpButton`, `https://developer.apple.com/documentation/appkit/`

Microsoft, primary for Windows expectations:

- *Writing style*, `https://learn.microsoft.com/en-us/windows/apps/design/style/writing-style` (ms.date 2020-09-24)
- *Windows app title bar*, `https://learn.microsoft.com/en-us/windows/apps/design/basics/titlebar-design` (2024-07-31)
- *Menu flyout and menu bar*, `https://learn.microsoft.com/en-us/windows/apps/develop/ui/controls/menus` (2025-02-26)
- *Dialog controls*, `https://learn.microsoft.com/en-us/windows/apps/develop/ui/controls/dialogs-and-flyouts/dialogs` (2026-07-15)
- Microsoft Style Guide, *Capitalization*, `https://learn.microsoft.com/en-us/style-guide/capitalization` (2024-08-26)

# Part 1: the way in

## 1.1 Whether there should be a flow at all, and how long

- **States** (Onboarding): "Ideally, people can understand your app or game simply by
  experiencing it, but if onboarding is necessary, design a flow that's fast, fun, and
  optional."
- **States** (Onboarding): "Postpone nonessential setup flows or customization steps. Provide
  reasonable default settings so most people can immediately start interacting with your app
  or game without performing additional configuration."
- **States** (Onboarding): "If you need to present a prerequisite onboarding flow, design a
  brief, enjoyable experience that doesn't require people to memorize a lot of information."
- **States** (Onboarding, on permission): "If your app or game needs access to private data or
  resources before it can function, consider integrating the permission request into your
  onboarding flow. In this scenario, making the request during your onboarding flow gives you
  the opportunity to show people why your app or game needs their permission and the benefits
  of granting it."
- **States** (Onboarding): "Avoid displaying licensing details within your onboarding flow."
- **States** (Managing accounts): "Explain the benefits of creating an account and how to sign
  up. If your app or game requires an account, write a brief, friendly description of the
  reasons for the requirement and its benefits. Display this message in your sign-in view."
- **States** (Launching): "macOS, visionOS, and watchOS don't require launch screens." and, of
  a splash: "Aim to display your splash screen just long enough for people to absorb the
  information at a glance" (Onboarding).
- **Infer.** The Turso-account path's connect-consent step is exactly the case the Onboarding
  permission sentence covers: a requirement that the step says why and what it gives is
  sourced; a requirement that it shows terms or licensing text is against the letter.

## 1.2 Actions per screen, and the primary

- **States** (Buttons): "Keep the number of prominent buttons to one or two per view."
- **States** (Buttons): "Use style — not size — to visually distinguish the preferred choice
  among multiple options. When you use buttons of the same size to offer two or more options,
  you signal that the options form a coherent set of choices. By contrast, placing two buttons
  of different sizes near each other can make the interface look confusing and inconsistent."
- **States** (Buttons): "Assign the primary role to the button people are most likely to
  choose. When a primary button responds to the Return key, it makes it easy for people to
  quickly confirm their choice."
- **States** (Entering data): "if you include a Next or Continue button after a set of text
  fields, make the button available only after people enter the data you require."
- **States** (Privacy, for a custom screen shown before a system permission alert): "Include
  only one button and make it clear that it opens the system alert." Scoped to pre-alert
  screens for system-protected resources; the Turso consent is a web OAuth-style grant, not a
  system alert, so this binds only by analogy (**Infer**).
- **Documents** (Setup Assistant, macOS 14 edition): each step offers one forward action
  ("Continue") and, where a step is deferrable, a named deferral: "Not Now" (accessibility,
  data transfer), "Set Up Later" (Apple Account, privacy steps), "Customize Settings" as the
  alternate on "Make This Your New Mac". The guide stresses that deferred steps can be done
  later in System Settings.
- **Documents** (System Settings sign-in, macOS 27 guide): "Enter your Apple Account email
  address or phone number, then click Continue." then "Enter your password, click Continue,
  then follow the onscreen instructions." The identifier and the password are two steps, each
  ending in Continue.
- **Documents** (Xcode): "On the Welcome to Xcode window that appears when you first launch
  Xcode, choose App from the New Project pop-up menu", and "click Clone Git Repository on the
  Welcome to Xcode window" (Xcode Help). The welcome window is a small set of start actions,
  not a form.
- **Infer.** Apple's own first-run surfaces put one forward action per step and name the way
  out ("Not Now", "Set Up Later") rather than offering two equal buttons. The welcome screen's
  two ways in ("use your Turso account" / "use a link and code") are a coherent set of
  choices, which by the Buttons sentence means equal size, and at most one of them prominent.

## 1.3 Copy: length, voice, capitalisation

- **States** (Writing): "Be clear. ... If you can use fewer words, do so."
- **States** (Writing): "When labeling buttons and links, it's almost always best to use a
  verb. Prioritize clarity and avoid the temptation to be too cute or clever with your labels.
  For example, just saying "Send" often works better than "Let's do it!""
- **States** (Writing), multi-step flows: "Begin with language like "Get Started" to indicate
  you're starting a flow. You can use the button label to hint at the next step, or use terms
  like "Continue" or "Next," but be consistent with what you choose. Make it clear when a flow
  is complete by using language like "Done.""
- **States** (Writing): "Adopt capitalization rules that align with your app's style, then
  apply them consistently. ... Title case is generally considered formal, while sentence case
  is more casual. Choose a style for each UI element type and use it consistently".
- **States** (Buttons, 2025-06-09 revision): "Using title-style capitalization, consider
  starting the label with a verb". (Menus): "To be consistent with platform experiences, use
  title-style capitalization."
- **States** (Privacy, purpose strings): "Use sentence case, avoid passive voice, and include
  a period at the end."
- **States** (Writing): "Avoid using we altogether because it may be unclear who the "we" in
  question refers to." and "Use possessive pronouns sparingly." (both added 2025-12-16).
- **States** (Writing, errors): "display it as close to the problem as possible, avoid blame,
  and be clear about what someone can do to fix it. ... "Choose a password with at least 8
  characters."" and "Interjections like "oops!" or "uh-oh" are typically unnecessary".
- **States** (Managing accounts): "Always identify the authentication method you offer."
  (example: "Sign In with Face ID" over "Sign In"). "Avoid using the term passcode to refer to
  account authentication."
- **Not found.** No HIG or Apple Style Guide sentence endorses all-lowercase UI copy. The Apple
  Style Guide says only: "If an onscreen element uses all capital letters or all lowercase
  letters, use title-style capitalization when writing the element name in documentation",
  and that UI-text capitalization rules are outside its department-style latitude.
- **Infer.** Apple's rule is consistency per element type, with title case as the platform
  default for buttons and menu items and sentence case for explanatory sentences. The current
  lowercase copy is permitted by the "align with your app's style" sentence only if applied
  per element type; it is not what Apple itself ships.

## 1.4 Fields: labels, icons, validation, the password

- **States** (Text fields): "Because placeholder text disappears when people start typing, it
  can also be useful to include a separate label describing the field to remind people of its
  purpose."
- **States** (Text fields): "Stack multiple text fields vertically when possible, and use
  consistent widths". "To the extent possible, match the size of a text field to the quantity
  of anticipated text."
- **States** (Text fields, iOS/iPadOS only): "use the leading end of a text field to indicate
  a field's purpose and the trailing end to offer additional features". The macOS section says
  nothing about leading icons; it adds only combo boxes.
- **Infer.** Leading icons in fields have an Apple source only for iOS and iPadOS. On macOS,
  Apple's text-field guidance does not call for them.
- **States** (Text fields): "when creating a user name or password, validation needs to happen
  before people switch to another field." (Entering data): "Dynamically validate field values."
- **States** (Entering data): "Never prepopulate a password field." "As much as possible, let
  people provide data by dragging and dropping it or by pasting it." (relevant to the join
  screen's pasted link and code).
- **States** (Managing accounts): "If you need to continue using passwords for authentication,
  augment security by requiring two-factor authentication". Passkeys are the stated preference
  when Sign in with Apple is not used.
- **States** (Sign in with Apple): "If you require an account, ask people to set it up before
  offering any sign-in options. Start by explaining the reasons for requiring an account."

## 1.5 Icons on buttons

- **States** (Buttons): "Try to associate familiar actions with familiar icons." and
  "Consider using text when a short label communicates more clearly than an icon. To use
  text, write a few words that succinctly describe what the button does."
- **States** (Toolbars): "Keep actions with text labels separate. Placing an action with a
  text label next to an action with a symbol can create the illusion of a single action".
- **States** (macOS push buttons): "Append a trailing ellipsis to the title when a push button
  opens another window, view, or app."
- **Infer.** Nothing in the HIG asks for a leading icon on every text button. The guidance is
  icon where familiar, text where clearer. A full-width stack of text buttons each with a
  leading icon is not an Apple pattern the sources show; it is not forbidden either.

## 1.6 Progress, back, disclosure

- **States** (Page controls): "Use page controls to represent movement between an ordered list
  of pages." "Center a page control at the bottom of the view or window." Dots are the Apple
  control for a flat, ordered set of pages.
- **States** (Layout, macOS): "Avoid placing controls or critical information at the bottom of
  a window. People often move windows so that the bottom edge is below the bottom of the
  screen." (Sidebars, macOS, says the same of sidebars.)
- **Infer.** On macOS these two pull against each other for a two-step walk: a bottom-centred
  step indicator is fine because it is not critical, but the forward button is.
- **States** (Toolbars): "Use the standard Back and Close buttons. ... Prefer the standard
  symbols for each, and don't use a text label that says Back or Close."
- **States** (Sheets): "The Back button lets people navigate to a previous step in a
  multi-step flow". "Avoid showing all three buttons — Cancel, Done, and Back — together."
- **States** (Right to left): "in the RTL context, a back button must point to the right".
  "Flip controls that show progress from one value to another."
- **States** (Disclosure controls): "Use a disclosure control to hide details until they're
  relevant." "Provide a descriptive label when using a disclosure triangle." A disclosure
  triangle "points inward from the leading edge when its content is hidden and down when its
  content is visible." This is the Apple home for "trouble signing in?".
- **States** (Buttons, iOS/iPadOS): a button can show an activity indicator and change its
  label, e.g. "Checkout" to "Checking out…". **States** (Progress indicators): "When possible,
  use a determinate progress indicator." "Don't switch from the circular style to the bar
  style."
- **Not found.** Apple does not document whether Setup Assistant shows a step count or a Back
  button; the setup guide names only forward and deferral actions. From memory Setup
  Assistant has a Back button at the lower leading corner; this is unverified here and is an
  open question, not a finding.

## 1.7 Layout, type, materials, motion, chrome

- **States** (Layout): "place the most important items near the top and leading side of the
  window". "Group related items ... you might use negative space, container shapes, or
  separator lines".
- **States** (Typography): macOS default text 13 pt, minimum 10 pt. macOS text styles: Large
  Title 26/32, Title 1 22/26, Title 2 17/22, Title 3 15/20, Headline 13 Bold, Body 13/16.
  "In general, avoid light font weights." "Minimize the number of typefaces you use".
- **States** (Materials): Liquid Glass is "a distinct functional layer for controls and
  navigation elements ... that floats above the content layer". "Don't use Liquid Glass in the
  content layer." "Use Liquid Glass effects sparingly." "Choose materials and effects based on
  semantic meaning ... Avoid selecting a material or effect based on the apparent color".
- **Infer.** A pre-sign-in form is content, not navigation. The HIG places glass on controls
  and navigation, so a glass card behind the form has no Apple source.
- **States** (Motion): "Add motion purposefully". "Make motion optional." "Let people cancel
  motion. ... don't make people wait for an animation to complete". "In apps, generally avoid
  adding motion to UI interactions that occur frequently."
- **States** (Windows): "Avoid creating custom window UI. ... Avoid making custom window frames
  or controls, and don't try to replicate the system-provided appearance. Doing so without
  perfectly matching the system's look and behavior can make your app feel broken." and "Make
  sure custom windows use the system-defined appearances" (key, main, inactive states).
- **States** (Sheets): "For complex or prolonged user flows, consider alternatives to sheets.
  ... In a macOS experience, you might want to open a new window".
- **Infer.** rentable already runs with decorations off and its own titlebar, which the
  Windows page advises against on macOS. That is a standing conflict, not one this effort
  creates, but any new chrome on the way-in screens adds to it.

# Part 2: the workspace control

## 2.1 Pop-up or pull-down: which control this is

- **States** (Pop-up buttons): "A pop-up button displays a menu of mutually exclusive options.
  After people choose an item from a pop-up button's menu, the menu closes, and the button can
  update its content to indicate the current selection." "Use a pop-up button to present a
  flat list of mutually exclusive options or states." Use a pull-down instead to "Offer a list
  of actions", "Let people select multiple items", or "Include a submenu".
- **States** (Pop-up buttons): "Give people a way to predict a pop-up button's options without
  opening it. For example, you can use an introductory label or a button label that describes
  the button's effect".
- **States** (Pull-down buttons): "listing a minimum of three items can help the interaction
  feel worthwhile. If you need to list only one or two items, consider using alternative
  components". "Display a succinct menu title only if it adds meaning."
- **Documents** (Xcode, the closest Apple precedent): "click the scheme name in the toolbar of
  your project window. Xcode displays a pop-up menu with a list of current schemes at the top,
  and commands to edit, create, and manage schemes at the bottom." Also: "choose an account
  from the Team pop-up menu ... If your account doesn't appear, choose Add an Account".
- **Infer.** Apple's own products do put a management command in a context-switching menu,
  below the choices (Xcode). By the HIG's pop-up definition, a menu that also holds actions is
  strictly a pull-down; Xcode calls its menu a pop-up anyway. Both readings have an Apple
  source. A menu with one held workspace plus one link has two items, under the pull-down
  minimum of three.

## 2.2 What the trigger shows

- **Documents** (Safari 17+): "the Safari toolbar will display a button with the name, symbol
  and colour of the currently used profile or Tab Group." The menu offers "New [Profile]
  Window" and "Switch to [Profile] Window"; creating and managing profiles lives in Safari
  Settings > Profiles, not in the menu.
- **Documents** (System Settings): the head of the sidebar shows "Sign in" before sign-in and
  the person's name after ("If you see your name, you're already signed in").
- **States** (NSPopUpButton): "The image displayed in a pop up button is taken from the
  selected menu item".
- **Not found.** No Apple source puts a secondary line (such as a member count) under the
  current context in a switcher trigger. Safari shows name, symbol, colour; System Settings
  shows name and picture; Xcode shows the scheme name.

## 2.3 What the menu contains, order, selection mark

- **States** (Menus): "Prefer listing important or frequently used menu items first."
  "Consider grouping logically related items. ... use a separator." "Be mindful of menu
  length." Exception for "user-defined or dynamically generated content ... a long menu is
  fine, and scrolling is acceptable."
- **States** (Menus): "Consider using a checkmark to show that an attribute is currently in
  effect. It's easy for people to scan for checkmarks". AppKit: the state image "is displayed
  to the left of the menu item" (that is, leading).
- **Not found.** No Apple source uses radio circles for the selected item in a menu. Apple's
  menus mark state with a checkmark.
- **States** (Menus, revised 2026-06-08): "Use menu item icons sparingly and with purpose.
  ... Don't display an icon if you can't find one that clearly represents the menu item."
  "Apply a uniform visual treatment across menu items in the same group. ... provide icons
  for all menu items in a group, or none of them."
- **States** (Menus): "Append an ellipsis to a menu item's label when the action requires more
  information before it can complete." "Remove articles like a, an, and the from menu-item
  labels". Title-style capitalization, as in 1.3.
- **States** (Toolbars, macOS): "Make every toolbar item available as a command in the menu
  bar." (**Infer**: rentable has a custom titlebar and no macOS menu bar entries for this; a
  requirement that workspace switching also exist as a menu command would have this source.)

## 2.4 Sidebars and where the control sits

- **States** (Sidebars): "A sidebar appears on the leading side of a view and lets people
  navigate between areas of your app or top-level collections of content". "In general, show
  no more than two levels of hierarchy in a sidebar." "Avoid putting critical information or
  actions at the bottom of a sidebar." "Avoid hiding the sidebar by default".
- **Documents** (Mail, Notes): Apple's own multi-account apps do not switch between accounts
  in a menu; they list every account as a section in the sidebar ("mailboxes on an account's
  mail server are shown in the account section of the sidebar"; Notes is organised by
  "accounts (iCloud or On My Mac, for example), and then by folders").
- **Infer.** Apple uses two patterns for more than one context: all contexts visible at once
  as sidebar sections (Mail, Notes) when they are read together, and one current context
  behind a button (Safari profiles, Xcode schemes) when they are separate. rentable's
  workspaces are separate databases, which matches the second.
- **Not found.** The HIG has no page or sentence on account, profile or workspace switchers.
  Nothing about a switcher at the head of a sidebar comes from the HIG itself.

## 2.5 Keyboard

- **States** (Keyboards): "Support Full Keyboard Access when possible. ... lets people navigate
  and activate windows, menus, controls, and system features using only the keyboard."
  "Define custom keyboard shortcuts for only the most frequently used app-specific commands."
  "Prefer the Command key as the main modifier". "Avoid using the Control key as a modifier."
- **States** (Focus and selection): "use a focus ring for a text or search field, but use a
  highlight in a list or collection."
- **Not found.** No Apple source gives a standard shortcut for switching account, profile or
  workspace.

# Part 3: where macOS and Windows disagree

| Matter | Apple states | Microsoft states |
| --- | --- | --- |
| Capitalisation of buttons and menu items | Title-style for buttons and menu items (Buttons, Menus); consistency per element type (Writing) | "Microsoft style uses sentence-style capitalization." "Capitalize the first word of a ... UI label (such as the name of a button or checkbox)". "Don't use all lowercase as a design choice." (Style Guide) |
| Default button position in a row | "Always place the default button on the trailing side of a row". Cancel "on the leading side" (Alerts) | "The "do it" action button(s) should appear as the leftmost buttons. The safe, nondestructive action should appear as the rightmost button." (Dialogs) |
| Selected item in a menu | Checkmark (Menus) | `RadioMenuFlyoutItem`, "Switching between mutually-exclusive menu items" (Menus); rendered with a check or bullet by the platform (**Infer**, not verified) |
| Menu icons | "all menu items in a group, or none of them" | Icons for "the most commonly used items"; "Don't feel obligated to provide icons for commands that don't have a standard visualization." Their own example mixes iconed and plain groups split by a separator |
| Use of "we" | "Avoid using we altogether" | "Use "we" to refer to your own perspective. It's welcoming" |
| Account in window chrome | Not in the title bar; context at head of sidebar (System Settings) or a toolbar button (Safari) | "If account representation is present, the person-picture control should be placed to the left of the caption controls. Increase the size of the title bar to 48px" |
| Window chrome | "Avoid creating custom window UI" | Title bar 32px standard; caption buttons at the trailing edge; icon and title "16px from the left-most border in LTR, or right-most border in RTL"; "All empty space in the title bar ... should be draggable" |
| Back control | Standard symbol, no "Back" text; flips in RTL | Back button in the title bar left of the title in LTR, glyph E830 |
| Periods | Purpose strings end with a period (Privacy) | "Don't end text for buttons, radio buttons, labels, or checkboxes with a period." |

**Infer.** Two rows would force a per-platform requirement if Apple fidelity is wanted on
macOS and Fluent fidelity on Windows: button order in a row (trailing primary vs leftmost
primary) and capitalisation (title case vs sentence case). The rest either agree in spirit
(short, verb-first, active labels; one clear primary; safe way out) or concern chrome the
app already owns.

# Open

- Setup Assistant's Back button and any step count: not documented in the pages read.
- The Xcode welcome window's layout (which actions, where the recent list sits): only its
  existence and two of its actions are documented.
- Pages, Keynote and other Apple apps' first-launch "What's New" or welcome windows: no primary
  source found in this pass.
- Whether Fluent's `RadioMenuFlyoutItem` renders a check or a dot: not verified.
