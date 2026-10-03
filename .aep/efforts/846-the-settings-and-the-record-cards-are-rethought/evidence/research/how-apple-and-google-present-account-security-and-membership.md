---

---

# Question

How do Apple (HIG first) and Google (Google Account help, Material second) present: password
change and other-device sign-out; disconnecting a connected account; leaving versus deleting a
group; sync status; where a domain-specific behaviour preference lives versus general settings;
list versus card collections on desktop; and actions on a single item?

# Sources

All read 2026-10-02. Apple support and Mac user guide pages carry the macOS 27 version selector as
their default on that date. HIG pages were read through their JSON data endpoint
(`developer.apple.com/tutorials/data/design/human-interface-guidelines/<page>.json`) because the
HTML is script-rendered; the text matches the public page.

- HIG Settings: https://developer.apple.com/design/human-interface-guidelines/settings
- HIG Lists and tables: https://developer.apple.com/design/human-interface-guidelines/lists-and-tables
- HIG Collections: https://developer.apple.com/design/human-interface-guidelines/collections
- HIG Boxes: https://developer.apple.com/design/human-interface-guidelines/boxes
- HIG Context menus: https://developer.apple.com/design/human-interface-guidelines/context-menus
- HIG Alerts: https://developer.apple.com/design/human-interface-guidelines/alerts
- HIG Buttons: https://developer.apple.com/design/human-interface-guidelines/buttons
- Apple, Review devices signed in to your Apple Account: https://support.apple.com/en-us/102649
- Apple, Change your Apple Account password: https://support.apple.com/en-us/101567
- Mac user guide, Manage your Apple Account settings on Mac: https://support.apple.com/guide/mac-help/manage-appleaccount-settings-mchl3f671010/mac
- Apple, How to leave or remove a member from a Family Sharing group: https://support.apple.com/en-us/102652
- Apple, Manage your apps with Sign in with Apple: https://support.apple.com/en-us/102571
- Mac user guide, Use your internet accounts on Mac: https://support.apple.com/guide/mac-help/add-your-email-and-other-accounts-mh35565/mac
- Mac user guide, Change iCloud settings on Mac: https://support.apple.com/guide/mac-help/change-icloud-settings-on-mac-mh36817/mac
- Mac user guide, Check your iCloud Drive file and folder status: https://support.apple.com/guide/mac-help/mchlc994344b/mac
- Apple, If your iCloud Photos aren't syncing: https://support.apple.com/en-us/101559
- Google, See devices with account access: https://support.google.com/accounts/answer/3067630?hl=en
- Google, Change or reset your password (Computer): https://support.google.com/accounts/answer/41078?hl=en&co=GENIE.Platform%3DDesktop
- Google, Manage links between your Google Account & apps from other developers: https://support.google.com/accounts/answer/13533235?hl=en
- Google, Join or leave a family on Google: https://support.google.com/families/answer/6317858?hl=en
- Google, Manage your family on Google (Computer): https://support.google.com/families/answer/6286986?hl=en&co=GENIE.Platform%3DDesktop
- Google Workspace Admin, Delete your organization's Google Account: https://support.google.com/a/answer/9468554 (search snippet only, page not opened)
- Google Workspace Admin, Make a user an admin: https://support.google.com/a/answer/172176 (search snippet only)
- Google Drive, Use Google Drive for desktop: https://support.google.com/drive/answer/10838124?hl=en
- Chrome, Get your bookmarks, passwords, and more on all your devices: https://support.google.com/chrome/answer/165139?hl=en&co=GENIE.Platform%3DDesktop
- Material Design 1, Cards: https://m1.material.io/components/cards.html (older Material version; see Not checked)
- Material Web, Lists component doc: https://github.com/material-components/material-web/blob/main/docs/components/list.md

Text pages give no screenshot detail. Where a finding is about visual treatment (red text, icon,
chevron), it is only recorded if a source states it in words.

# Findings

## 1. Password change and other devices

- **source (Apple, macOS 27 / iOS).** The Apple Account pane lists, in order: Personal
  Information, Sign-In & Security, Payment & Shipping, iCloud, Family, Media & Purchases, Sign in
  with Apple, Devices, Contact Key Verification, Sign Out. Devices "review and manage the trusted
  devices that use your Apple Account"; Sign Out is the last item. (Manage your Apple Account
  settings on Mac)
- **source (Apple).** The device list is on the account page itself: "Click [your name], then
  scroll down to see a list of devices." Clicking a device shows its information; removal is
  "Remove from Account", followed by "Review the message that appears, then confirm." (102649)
- **source (Apple).** Password change lives under Sign-In & Security > Change Password. On iPhone
  the flow then offers "Remove Other Devices" or "Keep All Devices Signed In"; the Mac text does
  not mention that choice. (101567)
- **source (Google, Computer).** Password lives at Security & sign-in > "How you sign in to
  Google" > Password; changing it "will sign you out from most locations", with stated exceptions
  (verification devices, some third-party-app devices, home devices). (41078)
- **source (Google).** Devices: Security & sign-in > "Your devices" panel > "Manage all devices".
  Each entry shows device, location, and the last time it communicated with Google; signed-out
  sessions carry a "Signed out" indication. Sign-out is per device: select the device, then
  "Sign out". (3067630)
- **observation.** Neither Google page describes a single "sign out of all other devices"
  control. Apple's only bulk sign-out found is the post-password-change choice on iPhone.
- **not found.** The text pages do not state what a device row shows on Apple (model, "This Mac"
  label), nor the exact confirmation wording on either platform.

## 2. Disconnecting a connected account or service

- **source (Apple).** Sign in with Apple is its own row in the Apple Account pane; it opens a list
  of apps. Selecting an app shows what was shared; removal is "Delete", then onscreen steps to
  confirm "you want to stop using Sign in with Apple for this app or developer." (102571)
- **source (Apple, macOS 27).** Internet Accounts: click the account, then "Delete Account at the
  bottom, then click OK". Alternative: "click the switch next to the feature" to turn one service
  off. Warning text: deleting "can remove data stored in your apps. The data may be restored if
  you ... add the account again." (mh35565)
- **source (Google).** Connections at myaccount.google.com/linkedapps, grouped by kind (Sign in
  with Google, Linked account, Access to your Google Account, Agent access) with filter and
  search. Per item: "See details", then a verb named for the relationship: "Stop using Sign in
  with Google", "Delete link", "Remove access", each followed by a confirmation. Removing a
  connection does not delete data held by the third party. (13533235)
- **interpretation.** Both place the disconnect action inside the item's detail, not on the list
  row, and both name the action by what ends ("Stop using", "Remove access") and not with a
  generic "Disconnect". Apple places Delete Account at the bottom of the detail.
- **not found.** Whether these buttons are red is not stated in the text.

## 3. Leaving versus deleting a group

- **source (Apple).** A member leaves: Family > your name > "Stop Using Family Sharing". The
  organizer disbands with the same path ("Stop" on Mac); turning it off removes all members at
  once. The organizer removes others from the member's detail: "Remove [name] from Sharing
  Group", then confirm. (102652)
- **interpretation (Apple).** The action sits on one's own member row, not at a group-level
  footer, and it uses one label for both roles; what differs is the consequence.
- **source (Google families).** "If you're a family manager or supervised member, you can't leave
  your family group." Members: "Leave family group" then "Leave" (some clients ask for the
  password first). Managers: "Delete family group"; "Once you delete a family group, you can't
  restore it"; children must be transferred first; a 12-month limit on creating or joining
  another group follows. Removing a member: select member > "Remove member" > "Remove", and the
  member is emailed. (6317858, 6286986)
- **source (Google families).** The manage page gives no step for transferring the manager role.
  (6286986)
- **source (Google Workspace, search snippet only).** Ownership moves by making another user a
  super admin and having them remove the original; deleting the organization account deletes all
  users and groups and "can't be restored". (172176, 9468554)
- **observation.** Google shows owner and member different actions (Delete versus Leave) and
  forbids the owner from leaving; Apple uses one control.
- **not found.** Placement as a red row at the bottom of the page is not stated in any text page.

## 4. Sync status

- **source (Apple, macOS 27).** iCloud pane: a storage bar with "Manage", then a "Saved to iCloud"
  section that "Shows the syncing status of Photos, Drive, Passwords, Notes, Messages, and Mail",
  with "See All". Each app has an on/off switch, worded per app ("Sync this Mac", "Use on this
  Mac"). A status circle: green (syncing), yellow (storage almost full), red (full), gray (not
  enabled). (mh36817, and the search snippet for it)
- **source (Apple).** iCloud Drive in Finder: per-item states (In iCloud, Downloaded, Waiting to
  Upload, Out of Space, Ineligible) and a progress pie, which also appears next to iCloud Drive in
  the sidebar for overall progress. Sidebar status is reached by hovering, then clicking the
  status icon. (mchlc994344b)
- **source (Apple).** iCloud Photos shows library status at the bottom of the library on Mac, with
  named pause reasons ("Syncing with iCloud Paused", "Poor Network Connection", "iCloud storage
  is full"). (101559)
- **source (Google).** Drive for desktop: a "Sync status" tile showing recently synced files and
  current activity; pause and resume at any time; "time-sensitive sync errors, show in your
  notifications". (10838124)
- **observation.** No Apple or Google source found shows a "Last synced at <time>" label. States
  are named by condition (paused, why) and progress, not by timestamp.
- **not found.** Chrome's sync status wording (for example "Sync is paused") was not confirmed on
  a primary page; only community threads mention it.

## 5. Where a domain-behaviour preference lives

- **source (HIG Settings).** "If you need to offer settings that affect only a specific task, you
  can provide these options within the task itself." Under "Task-specific options": "prefer
  letting people modify task-specific options without going to your settings area ... make these
  options available in the screens they affect", because a settings area "disconnects it from its
  context".
- **source (HIG Settings).** "Put general, infrequently changed settings in your custom settings
  area", with examples "window configuration", "game-saving behavior", "options related to
  people's accounts". "Minimize the number of settings you offer."
- **source (HIG Settings, macOS).** A settings window uses a toolbar of panes, "each contain a
  group of related settings"; restore the last viewed pane; title the window after the pane.
- **source (HIG Boxes).** A box title in a settings pane takes a trailing colon.
- **observation.** The HIG does not define what a "General" pane contains, nor whether a
  domain threshold (an "ending soon" window) is a task option or a general setting. Its examples
  of task options are view-shaping (show/hide, reorder, filter).
- **not found.** No Google or Material source on settings structure was read.

## 6. Lists versus cards

- **source (HIG Lists and tables).** "Prefer displaying text in a list or table ... the row-based
  format is especially well suited to making text easy to scan and read. If you have items that
  vary widely in size, or you need to display a large number of images, consider using a
  collection instead." Long items: list titles only and reveal the content in a detail view. On
  macOS: sortable column headings, resizable columns, alternating row colours in multicolumn
  tables.
- **source (HIG Collections).** "Collections are ideal for showing image-based content." "Consider
  using a table instead of a collection for text."
- **source (HIG Boxes).** Keep a box "relatively small" against its container; avoid nested
  boxes, use padding and alignment for subgroups.
- **source (Material 1, older version).** A card is "an entry point to more detailed
  information"; suited to heterogeneous content, variable length, content not needing direct
  comparison. "A quickly scannable list, instead of cards, is an appropriate way to represent
  homogeneous content that doesn't have many actions." Card actions: the card itself is the
  primary action; supplemental actions limited to two plus an optional overflow menu, placed
  consistently.
- **source (Material Web, list.md, reviewed 2026-07-31).** M3 lists are "continuous, vertical
  indexes of text and images"; an item has a headline, supporting text, trailing supporting text,
  and optional leading/trailing icon or image.
- **not found.** The M3 card and list guideline pages (m3.material.io) are script-rendered and
  could not be read; their M3 wording was not verified.

## 7. Actions on a single item (export, import, delete)

- **source (HIG Context menus).** A context menu "provides access to functionality that's directly
  related to an item." Include the commands people most likely need there, keep it short, at
  most about three groups, one level of submenu. "Always make context menu items available in the
  main interface, too." Hide unavailable items, do not dim. On iOS, iPadOS, visionOS, destructive
  items go at the end and are marked destructive (red).
- **source (HIG Alerts).** Confirm only uncommon destructive actions that cannot be undone. Name the
  confirm button by its result ("Delete", "Erase"), never "OK"; always include "Cancel"; the
  destructive style is for a destructive action people did not deliberately choose.
- **source (HIG Buttons).** A destructive button uses system red; never give the primary role to a
  destructive action.
- **source (Material 1).** Card overflow menus hold supplemental actions.
- **not found.** No HIG passage speaks to export or import specifically, or to a "More" button on
  a list row in macOS.

# Conclusion

Both vendors put the device list, the password, connected services and membership inside one
account page, each as its own row that opens a detail view. Removal actions (remove device, stop
using, leave) live in the item's detail and are named by what ends, then confirmed. Google gives
owner and member different verbs and blocks the owner from leaving. Apple gives both roles one
control. Sync is shown as a named state with a reason and progress, plus per-service switches.
No primary source found shows a "last synced" timestamp. The HIG sends task-specific options to
the screen they affect and keeps general, rarely changed options in Settings. It prefers lists for
text and collections for images. Item actions go in a short context menu, and the main interface
offers the same commands.

# Not checked

- Screenshots, so: red styling of rows, icons, chevrons, the "This Mac" or "This device" label,
  and exact confirmation dialog text on either platform.
- m3.material.io Cards and Lists guidance (unreadable here). Material 1 stands in and is older.
- Google Workspace transfer and delete pages were seen only as search snippets.
- Chrome sync status wording, and the Google Account Security page layout beyond the paths named.
- iOS Settings device-row contents, and any HIG text on export/import placement.
