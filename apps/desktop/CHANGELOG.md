# rentable

## 0.14.0

### Minor Changes

- [#829](https://github.com/saud-alnasser/rentable/pull/829) [`b7326ff`](https://github.com/saud-alnasser/rentable/commit/b7326ffa2dde3984f5f8ad02d6180e21d24917cc) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - a link alone opens nothing: every link now needs the six-character code that came with it before the organization is reached, and the code lasts as long as the link rather than ninety seconds. the organization's own link is gone with it, along with the credential it carried that never expired, so nothing rentable hands out reads your records without the code that was read out beside it

  an account is made first and a link comes after it. the owner and administrators add an account from the organization section with a username, a role, what the person may do and the workspaces they hold; it holds no password at all until its first link is opened. one act on the account makes that link and its code, and what kind of link it is follows the account: one whose password is not set yet asks the person to choose one when they open it, and one that already has a password lands its machine at the sign-in wall. an account is held on as many machines as it is given links for: a link is made whether or not somebody is signed in on the account, and each one admits one more machine, once. one unopened link stands for an account at a time, since making the next replaces the one nobody opened, so a second machine is given its link after the first has used theirs. resetting a password now takes the password away rather than handing out a link, and the next link asks for a new one. a member makes no link of their own any more: they are given one by whoever keeps the accounts

  the first screen of a machine that holds nothing now says what each way in needs: your turso account, for whoever owns the organization whether it is being made now or already there, and a link with its code, what whoever keeps the accounts handed you. the connect screen is one form of both halves, the link and the six characters that came with it; an invitation then asks you to choose your password, a link for an account that already has a password connects the machine straight away, and a link that cannot be read and a code that is wrong are each said on their own field

  an owner gets onto a machine with their turso account, whether it is their next one or their way back after every machine is gone. after the consent, a group that already holds an organization is no longer refused: the walk says so in a sentence, asks for the owner's username and password, and connects this machine to what is already there, signed in, with every credential in the organization renewed on the way. only the owner's password does it, and it does it whatever other machines are in use: the owner's account connects this machine whether or not anybody else is signed in on one

  the organization now knows which machines hold it: a machine joins the register when it connects, says who is signed in on it and when it was last seen, and leaves when it disconnects; the members directory reads it to say where each account stands, and nothing is refused on it

  settings is four sections now, each named for what it holds. general keeps the language and the ending soon figure and takes updates and diagnostics under it, each under its own heading; account is your own, your name, your password and your other machines; organization is where this machine stands with turso, the turso account, the people, and the two ways out; workspaces is the directory of workspaces with export and import beneath. nothing left the area and nothing you could do before is gone, and who may see what is unchanged: a member still meets no list of people and nothing of the turso account. a bookmark or a link naming one of the sections that went opens the section that holds it now

  the people are a directory of cards in the organization section, one per person, the way every other record here is shown. a card names them, says their role, says how many workspaces they hold, and carries one line saying where they stand: no password yet, no machine signed in, or signed in on a machine. opening a card opens what you may change about them, and everything you can do to them is in the card's own menu, where an act you do not hold is simply not there. that line is a fact about the account and nothing more: the link is there to hand out whatever it says. nobody changes their own role, permissions or workspaces, so a card with your own name on it offers nothing, and so does the owner's card to everybody else; the only act on the owner's own card is handing the organization over. the section's name, the sentence saying what it is for and the control that adds a member sit in a tray above the cards, the way the contracts list has it

  a member's role, what else they may do and the workspaces they hold are one sheet now, opened by the card or by edit on its menu. the role is a chooser of three that says who each one is for in a sentence. what they may do beyond their role is a short list of plain sentences with an x on each, and one picker where you tick everything you want to allow and confirm once; the wall of seven checkboxes is gone, and so are the two menu entries that opened two dialogs. the workspaces are rows on the same sheet, each with a named level and a line saying what it is good for, and one save writes whatever you changed, with anything refused said on the section that asked for it. what each role may do is a table of its own, read from the tray beside the add, and it names the acts nobody can be given at all and why

  the workspaces section is a directory of cards too, one per workspace, the way the people read. a card names the workspace and says how many people are in it, with a small dot before the name of the one you have open, and opening a card opens what you may change about it. rename, members and delete are in the card's own menu in plain words, and an act you do not hold is simply not there. the section's name, the sentence saying what it is for and the control that makes a new workspace sit in a tray above the cards, with the reason standing in the control's place where this machine cannot reach the turso account. export and import stay beneath, under the name of the workspace they act on

  your own section states facts and offers its writes on a surface: the password is a row saying what it is with a control that opens the three fields when you ask for them, rather than three empty fields drawn under a heading on every visit. signing yourself out of your other machines is beneath it, unchanged

  the organization section opens with one sentence on where this machine stands with the organization on turso: up to date, and how long ago it last reached turso; the date and time it last reached turso, where that is more than a day ago; that it has not reached turso yet, on a machine that never has; or what needs doing, whether the turso account, this machine's access or this machine reconnecting, with the sentence and the control that go with it beneath. one control, named sync, asks turso now. the coloured badge and the one word of status it carried are gone, and sync is the name of that control and nothing else on the block

  the owner can hand the organization to somebody else, and it takes both of them. on their own card in the organization section the owner opens a panel saying what changes, names the person and types their password, and that makes an offer and nothing more; while it stands the same card offers to withdraw it. the person it was made to sees one line about it in their own account section, and accepting there with their own password is what moves the organization: they become the owner, the owner becomes an administrator, and from then on it is their password that gets them back in on a new machine. every other machine notices the change on its own and carries on. the turso account does not go with it, so until the new owner connects their own from the organization section the acts that need it run on the machine that connected the account first, and that section on their machine says so

  an owner can end the organization. at the foot of the organization section, under one heading for the two ways out, the owner alone is offered a delete beside disconnecting this machine: a panel says what goes, every workspace and everything in it and every member's way in, takes their password, and then removes every workspace database and the organization itself from their turso account and leaves this machine holding nothing. every other machine finds the organization gone the next time it opens and lands on the first screen. nothing puts any of it back

- [#825](https://github.com/saud-alnasser/rentable/pull/825) [`9960b46`](https://github.com/saud-alnasser/rentable/commit/9960b4685a622fa4af3fd6b40ca34c3a4df9b014) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - the application holds one organization at a time, or none. a machine is connected to an organization by its link alone, with no vault opened and nobody signed in until the wall; disconnecting forgets it whole, deleting every organization and workspace replica on this machine, emptying the record and clearing the turso authority, while the organization and its workspaces on turso are untouched and the link connects again. a machine still holding what was built before this release, a record of several organizations or a replica whose members carry an email and no username, forgets all of it at startup and opens on the screen a machine with nothing shows

- [#820](https://github.com/saud-alnasser/rentable/pull/820) [`4b7f2dc`](https://github.com/saud-alnasser/rentable/commit/4b7f2dc2ff880fc0ba22d6a5e077e58096f28034) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - a member chooses their own password when they open their link, changes it from the account section whenever they like, and whoever may reset a password takes it away and is told which workspaces the reset could not carry over

- [#827](https://github.com/saud-alnasser/rentable/pull/827) [`f56ac57`](https://github.com/saud-alnasser/rentable/commit/f56ac57af993d56a0dc82cc7b1332a3112b71de8) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - you can now sign yourself out of every machine but the one you are at, from the account section of settings, and whoever may reset a member's password can sign that member out of every machine from their card's menu. your password is not changed by either: a machine that was signed out asks for it again the next time it opens, and one that is running goes back to the sign-in screen within a few minutes, where it says it was signed out from another machine. the owner's own sessions are theirs alone to end

- [#820](https://github.com/saud-alnasser/rentable/pull/820) [`4b7f2dc`](https://github.com/saud-alnasser/rentable/commit/4b7f2dc2ff880fc0ba22d6a5e077e58096f28034) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - a member joins an organization by opening the link they were handed, which opens the application on windows, linux and macos, and by pasting it into the connect screen where it does not; a lapsed, used or replaced link is refused with the organization still named

- [#820](https://github.com/saud-alnasser/rentable/pull/820) [`4b7f2dc`](https://github.com/saud-alnasser/rentable/commit/4b7f2dc2ff880fc0ba22d6a5e077e58096f28034) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - a workspace behind the schema this version of rentable ships is brought up to it by whichever member opens it, under a lease with a deadline, and the loading screen says so while it runs; a workspace upgraded by a newer rentable is refused with the two version numbers and what to do, and nothing in it is read

- [#820](https://github.com/saud-alnasser/rentable/pull/820) [`4b7f2dc`](https://github.com/saud-alnasser/rentable/commit/4b7f2dc2ff880fc0ba22d6a5e077e58096f28034) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - signing in is a password that unlocks your place in an organization, on this machine, with or without a connection; the sign-in screen names the organization this machine holds

- [#820](https://github.com/saud-alnasser/rentable/pull/820) [`4b7f2dc`](https://github.com/saud-alnasser/rentable/commit/4b7f2dc2ff880fc0ba22d6a5e077e58096f28034) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - when turso refuses for the organization's account, for quota or for billing, the workspace page says the account needs attention rather than showing a sync error: a member is told whom to tell and nothing about the account, the owner is told what turso said and where on turso to go, and everything keeps working on the machine meanwhile

- [#820](https://github.com/saud-alnasser/rentable/pull/820) [`4b7f2dc`](https://github.com/saud-alnasser/rentable/commit/4b7f2dc2ff880fc0ba22d6a5e077e58096f28034) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - an owner or a member gets their organization back on a new machine, and which way follows who they are. an owner connects their turso account again, because the authority is kept on no database, and the walk finds the organization the consented group already holds and connects this machine to it with their username and their password, every credential in the organization renewed on the way. a member is handed a link and its code by whoever keeps the accounts; opening it connects the machine and leaves it at the sign-in wall, where their own password admits them. either way everything they held is restored from the organization database and verified

- [#623](https://github.com/saud-alnasser/rentable/pull/623) [`5c44585`](https://github.com/saud-alnasser/rentable/commit/5c44585c64006b41d2dbf9478b6b477e1884b451) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - your workspace follows you between machines: what you record on one reaches the others, and what
  they record reaches you. the copy on a machine stays for as long as you have access to that
  workspace, so signing out and back in costs nothing.

- [#825](https://github.com/saud-alnasser/rentable/pull/825) [`9960b46`](https://github.com/saud-alnasser/rentable/commit/9960b4685a622fa4af3fd6b40ca34c3a4df9b014) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - every screen that names a member does so by username. setting up an organization asks the owner for theirs on the same step as the name and the password; adding a member asks for a username, a role, what they may do and the workspaces they hold, and shows nothing to copy afterwards, because the account holds no password until a link is made for it and opened. the people are named by username alone, on one card each, and the organization section says which organization this machine holds and offers to disconnect it after one confirm, which signs you out and forgets every copy kept here while leaving the organization on turso untouched

- [#825](https://github.com/saud-alnasser/rentable/pull/825) [`9960b46`](https://github.com/saud-alnasser/rentable/commit/9960b4685a622fa4af3fd6b40ca34c3a4df9b014) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - an account can be renamed: the owner or an administrator changes a member's username from their row in the members list, under the same rules a username is given by, and a username somebody else holds is refused. nobody renames themselves, and nothing tells the member; the person who renamed them does

- [#825](https://github.com/saud-alnasser/rentable/pull/825) [`9960b46`](https://github.com/saud-alnasser/rentable/commit/9960b4685a622fa4af3fd6b40ca34c3a4df9b014) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - an account is a username: a member is named by one username in place of an email address and a display name, three to thirty-two characters of letters, digits, dots, underscores and hyphens, unique in the organization whatever its case. setting up an organization asks the owner for theirs, and inviting a member asks for the member's

- [#600](https://github.com/saud-alnasser/rentable/pull/600) [`df2ed68`](https://github.com/saud-alnasser/rentable/commit/df2ed68d55867f15594185f2d5053e6b121cbd0e) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - signing in is required to open the app: the sign-in wall stands before anything renders, signing out returns to it, and settings names the organization this machine holds

- [#820](https://github.com/saud-alnasser/rentable/pull/820) [`4b7f2dc`](https://github.com/saud-alnasser/rentable/commit/4b7f2dc2ff880fc0ba22d6a5e077e58096f28034) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - an administrator adds a member from the organization section, naming their role and the workspaces they belong to, and hands over the link and its code themselves because the application sends no mail; a link lapses after a week, and making the next one replaces one nobody opened

- [#820](https://github.com/saud-alnasser/rentable/pull/820) [`4b7f2dc`](https://github.com/saud-alnasser/rentable/commit/4b7f2dc2ff880fc0ba22d6a5e077e58096f28034) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - an owner creates the first workspace from inside the application, on the organization's own turso account, and every member opens the workspaces they were granted

- [#820](https://github.com/saud-alnasser/rentable/pull/820) [`4b7f2dc`](https://github.com/saud-alnasser/rentable/commit/4b7f2dc2ff880fc0ba22d6a5e077e58096f28034) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - an owner sets up an organization on their own turso account from the sign-in screen: one browser consent, a name and a password, and a join link to hand out

- [#609](https://github.com/saud-alnasser/rentable/pull/609) [`ba42aba`](https://github.com/saud-alnasser/rentable/commit/ba42abaf2a0de7fedc63874c1547270be90a420f) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - retire Google Drive sync and the local backup: a workspace is a replica of a database on the organization's own Turso account, and Turso holds the record and its point-in-time restore

- [#827](https://github.com/saud-alnasser/rentable/pull/827) [`f56ac57`](https://github.com/saud-alnasser/rentable/commit/f56ac57af993d56a0dc82cc7b1332a3112b71de8) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - settings is one area rather than four pages. `/organization`, `/workspace` and `/account` are gone, and `/settings` holds general, account, organization and workspaces as tabs above the page, each named for what it holds and each with an address of its own so a menu or the command palette can open one directly. what a section shows is what your place in the organization allows, and somebody who is not signed in is offered general alone. the rail's workspace menu opens the workspaces section, the account menu offers settings and the way out, and the page still opens before anybody has signed in, with the language, updates and diagnostics on it

- [#827](https://github.com/saud-alnasser/rentable/pull/827) [`f56ac57`](https://github.com/saud-alnasser/rentable/commit/f56ac57af993d56a0dc82cc7b1332a3112b71de8) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - a turso group holds one organization. a first run whose consent lands on a group that already holds one is refused before anything is created, naming the database that is in the way, and the consent is given back so you can grant another over a different group or a different turso account. other databases in the group do not count, so a free or developer account's one group still serves, and the connect step says the rule before you grant anything.

- [#579](https://github.com/saud-alnasser/rentable/pull/579) [`e691cd4`](https://github.com/saud-alnasser/rentable/commit/e691cd470d0f920476ea1da7c8c180760a534d29) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - give every record an identity of its own rather than the next number up

- [#820](https://github.com/saud-alnasser/rentable/pull/820) [`4b7f2dc`](https://github.com/saud-alnasser/rentable/commit/4b7f2dc2ff880fc0ba22d6a5e077e58096f28034) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - an administrator removes a member from the organization page, which ends their access when their credential runs out and disturbs nobody else; an owner can remove and lock out instead, which cuts the member off at once and is told beforehand how many other members will stop syncing until their application reconnects on its own

- [#825](https://github.com/saud-alnasser/rentable/pull/825) [`9960b46`](https://github.com/saud-alnasser/rentable/commit/9960b4685a622fa4af3fd6b40ca34c3a4df9b014) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - signing in is a username and a password against the organization this machine holds. the password is tried against each member's vault and the username on the row that opens has to be the one typed, so a wrong password, an unknown username and a known username with somebody else's password are refused with one sentence, and it works with or without a network

- [#611](https://github.com/saud-alnasser/rentable/pull/611) [`46a553d`](https://github.com/saud-alnasser/rentable/commit/46a553ddf0b43ef3354d11dea3f120fc2d72bdad) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - stop keeping backup files on this machine. a workspace is kept for you now, and its point-in-time copies are kept with it

- [#608](https://github.com/saud-alnasser/rentable/pull/608) [`766f593`](https://github.com/saud-alnasser/rentable/commit/766f5935e6dd36b3d4f8f1d3a8a52015ca2a4727) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - stop applying migrations on this machine — a workspace's schema is applied where the workspace is

- [#820](https://github.com/saud-alnasser/rentable/pull/820) [`4b7f2dc`](https://github.com/saud-alnasser/rentable/commit/4b7f2dc2ff880fc0ba22d6a5e077e58096f28034) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - the desktop no longer signs anybody in with google or talks to a control plane of ours: an organization lives on its owner's own turso account, and the setup file asks for nothing but the updater key

- [#827](https://github.com/saud-alnasser/rentable/pull/827) [`f56ac57`](https://github.com/saud-alnasser/rentable/commit/f56ac57af993d56a0dc82cc7b1332a3112b71de8) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - every link now comes with a six-character confirmation code to read out on a call. the code is one half of what opens what the link seals and the link's own secret is the other, so a link that leaks or is forwarded opens nothing without the code that came with it, and nothing behind the link is reached until the code has been typed. the code lasts as long as the link it came with, and the person opening the link types it on the same form as the link itself. the connect screen names nobody before the code is given

- [#827](https://github.com/saud-alnasser/rentable/pull/827) [`f56ac57`](https://github.com/saud-alnasser/rentable/commit/f56ac57af993d56a0dc82cc7b1332a3112b71de8) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - the people in the organization are one directory of cards, everybody on a card of their own, the people who have not signed in yet included: the username with the role beside it, how many workspaces they hold, and one line saying where they stand, whether they have no password yet, no machine signed in, or a machine signed in. what you may do to somebody is on the card's own menu, and you are offered only the acts you may perform: edit, a link, reset password, sign out everywhere, remove, and lock out. opening a card, or edit on its menu, opens one surface carrying their role, what they may do beyond it and the workspaces they hold, with a sentence saying what each role is for and what each act lets the person do; giving somebody an act that writes another person's row is the owner's alone and is offered to nobody else. adding an account asks for a username, a role, what they may do and the workspaces they hold, and shows nothing to copy afterwards, because the account holds no password until a link is made for it and opened. the separate list of pending accounts is gone.

- [#825](https://github.com/saud-alnasser/rentable/pull/825) [`9960b46`](https://github.com/saud-alnasser/rentable/commit/9960b4685a622fa4af3fd6b40ca34c3a4df9b014) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - the workspace menu at the top of the sidebar now lists every workspace you hold, marks the one that is open, and opens another when you choose it. the application comes back up on the chosen workspace by the same path it takes after signing in, with nothing left on screen from the one before, and the next launch opens the one you chose last

- [#639](https://github.com/saud-alnasser/rentable/pull/639) [`5d9d415`](https://github.com/saud-alnasser/rentable/commit/5d9d415f222236a2f0bbeeda1d2e6285b6804144) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - the sidebar names the workspace on top and the account underneath, each opening its own menu: signing out and settings move there from the settings page

- [#825](https://github.com/saud-alnasser/rentable/pull/825) [`9960b46`](https://github.com/saud-alnasser/rentable/commit/9960b4685a622fa4af3fd6b40ca34c3a4df9b014) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - setting up an organization is three steps, connect, name and workspace, each saying which step it is and each with a way back in the card's corner. the connect step reads as three short facts with a glyph each, a machine that already holds the turso authority is not asked for it again, and naming the first workspace on the last step opens the application on it, so the screen that showed the join link and asked you to continue is gone. the link is on the organization page, where it stays

- [#829](https://github.com/saud-alnasser/rentable/pull/829) [`b7326ff`](https://github.com/saud-alnasser/rentable/commit/b7326ffa2dde3984f5f8ad02d6180e21d24917cc) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - the workspace menu at the top of the rail is the workspace and the switch. it names the workspace this machine has open, lists the ones you hold with the open one marked, and offers one row to the workspaces section of settings. inviting somebody and creating a workspace have left it, along with the sentence that refused them to whoever could not do either: both are offered in the settings area, in the members and workspaces sections, where every other act on a person and on a workspace already lives

### Patch Changes

- [#675](https://github.com/saud-alnasser/rentable/pull/675) [`9e5d82d`](https://github.com/saud-alnasser/rentable/commit/9e5d82d97b6d8bdbc91181e6a44643e4cde32860) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - terminate, restore or delete a selection of contracts and the notice that says how many went through now offers to take the whole action back, the way every other change in the application does

- [#680](https://github.com/saud-alnasser/rentable/pull/680) [`9080c46`](https://github.com/saud-alnasser/rentable/commit/9080c464593dccb17f7fdc82ab65026028f526c9) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - a component that fails while drawing no longer takes the window with it. the screen it was on is replaced with a card that says what happened and offers to draw it again or to leave for the dashboard, with the rail and the titlebar still there. where the chrome itself is what failed there is no rail to keep, so the same card is drawn on its own rather than a blank window. both are written to the diagnostics file on this machine

- [#815](https://github.com/saud-alnasser/rentable/pull/815) [`45f9248`](https://github.com/saud-alnasser/rentable/commit/45f92481f57fa6fec523185ff0ecbb309f6c52da) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - a contract record now draws the tenant's phone number the way the tenant record and the directory already do, so in Arabic the country code sits at the start of the number instead of the end

- [#685](https://github.com/saud-alnasser/rentable/pull/685) [`20ff178`](https://github.com/saud-alnasser/rentable/commit/20ff178a116d232bc06678f7e7aaeb29eddcc8ce) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - the contracts list no longer reads every payment in the workspace to count each contract's own, so it opens in a fraction of the time on a filled workspace

- [#815](https://github.com/saud-alnasser/rentable/pull/815) [`45f9248`](https://github.com/saud-alnasser/rentable/commit/45f92481f57fa6fec523185ff0ecbb309f6c52da) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - the two unit panes on a contract now count in the reader's digits, so in Arabic their headings read in Arabic-Indic numerals like every other count on the screen rather than in Latin ones

- [#673](https://github.com/saud-alnasser/rentable/pull/673) [`e6aa0df`](https://github.com/saud-alnasser/rentable/commit/e6aa0df6c8ccd01d952ca1a4b5a94d6a95b294a0) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - open a rank from the dashboard and the contracts list reads the contracts in it rather than every contract in the workspace

- [#816](https://github.com/saud-alnasser/rentable/pull/816) [`c75f02a`](https://github.com/saud-alnasser/rentable/commit/c75f02add2cf47fe752bc8cd8a982e7de732ab02) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - a record page that is still loading says the record is on its way, rather than saying the app is loading

- [#686](https://github.com/saud-alnasser/rentable/pull/686) [`f8f1208`](https://github.com/saud-alnasser/rentable/commit/f8f1208307de53b72b044e28a4ca3952c4337290) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - searching by a name in Latin letters no longer pays for the Arabic folding it cannot use, so a large directory searches several times faster

- [#689](https://github.com/saud-alnasser/rentable/pull/689) [`44e4150`](https://github.com/saud-alnasser/rentable/commit/44e4150df6d130cd0918c39997bef1083d32c4fe) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - following a see all on the dashboard opens the contracts list narrowed to that rank, where it was reaching the error screen instead. the narrowing is then the reader's to change or clear from the list's own filter, and a reload does not put back one they have cleared

- [#672](https://github.com/saud-alnasser/rentable/pull/672) [`ffac49d`](https://github.com/saud-alnasser/rentable/commit/ffac49d651a58bf7e50e40c0bbeef611474d83e5) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - a workspace replica is named for the workspace rather than for the machine, so a machine that has one already pulls a fresh copy once after updating

- [#677](https://github.com/saud-alnasser/rentable/pull/677) [`5737a57`](https://github.com/saud-alnasser/rentable/commit/5737a57b43a33d61ac7e97fbb8d0d6a923a4c9e6) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - select several complexes, or several of a complex's units, and delete the whole selection at once. the confirmation asks the workspace what would happen rather than reading the rows, so a unit whose contract has not started yet is shown as refused even though the list calls it vacant. one undo puts the set back whole

- [#674](https://github.com/saud-alnasser/rentable/pull/674) [`cc02a51`](https://github.com/saud-alnasser/rentable/commit/cc02a51ca89c66824cb2d16dee7b01c4121eda1c) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - select several contracts on any of the three lists that hold them and terminate, restore or delete the whole selection at once, after a confirmation that has already asked what would happen and shows how many would go through and how many would not

- [#678](https://github.com/saud-alnasser/rentable/pull/678) [`07579dd`](https://github.com/saud-alnasser/rentable/commit/07579ddc0ca388ab5f8e58d03a2f420e79d78c75) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - select several payments on a contract's statement and delete the whole selection at once, after a confirmation that says how many would go through. one undo puts the set back whole, and the contract's paid amount is recomputed once rather than once per payment

- [#676](https://github.com/saud-alnasser/rentable/pull/676) [`27d5f61`](https://github.com/saud-alnasser/rentable/commit/27d5f615e803296d5896671e35e1c4d2a1877377) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - select several tenants in the directory and delete the whole selection at once, after a confirmation that says how many would go through and names the ones still holding contracts. one undo puts the set back whole

- [#691](https://github.com/saud-alnasser/rentable/pull/691) [`f5fc04d`](https://github.com/saud-alnasser/rentable/commit/f5fc04dc7d4067692b5f8eaaa888d4a437a1d34b) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - every list that acts on a selection now says when the workspace changed while the confirmation was open, naming what it could not do

- [#827](https://github.com/saud-alnasser/rentable/pull/827) [`f56ac57`](https://github.com/saud-alnasser/rentable/commit/f56ac57af993d56a0dc82cc7b1332a3112b71de8) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - a sign-out of every machine holds. renaming a member, changing what they may do or removing them no longer puts their sign-out back, and a reset keeps it; a sign-out made with no connection says so and goes out at the next one. what a member may do is read off their row for every act, so taking an act away reaches a session they already have open within a few minutes rather than at their next sign-in.

- [#827](https://github.com/saud-alnasser/rentable/pull/827) [`f56ac57`](https://github.com/saud-alnasser/rentable/commit/f56ac57af993d56a0dc82cc7b1332a3112b71de8) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - stay signed in between launches: once you have signed in on a machine, it opens straight into the workspace you had last, and signing out or disconnecting asks for your password again. nothing is handed you a password any more, so the screen that made you choose a new one on your first sign-in is gone.

- [#831](https://github.com/saud-alnasser/rentable/pull/831) [`5c2cb42`](https://github.com/saud-alnasser/rentable/commit/5c2cb42a88505db1eb71bb0bc86afb10f86e7167) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - a startup that failed and an update that needs recovering stop wearing the same face: each screen says what happened and offers the move that fits it

- [#692](https://github.com/saud-alnasser/rentable/pull/692) [`aa137e6`](https://github.com/saud-alnasser/rentable/commit/aa137e6e51e072dc7baaff1fed02d211a910172e) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - a startup that fails before the application has loaded a language now shows what went wrong and offers the diagnostics folder, instead of an empty window

- [#666](https://github.com/saud-alnasser/rentable/pull/666) [`625b140`](https://github.com/saud-alnasser/rentable/commit/625b140991c3a8be268f0e58ef43e475e39a10ea) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - a toast says what kind of thing happened in its colour, not only in its glyph

- [#625](https://github.com/saud-alnasser/rentable/pull/625) [`648e922`](https://github.com/saud-alnasser/rentable/commit/648e922054b75fd6edeb4e9d854d4ce089da9190) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - a workspace file imports again when its contracts hold units; before, any assignment refused the whole import

- [#706](https://github.com/saud-alnasser/rentable/pull/706) [`cedf9e5`](https://github.com/saud-alnasser/rentable/commit/cedf9e539263bdff5551fdba09b4cac755b811af) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - a workspace can be renamed from the workspaces section, and the name reaches the sidebar, the workspace menu and the section without restarting the app. the organization holds the name, so another machine signed in to the same workspace picks it up on its own

- [#702](https://github.com/saud-alnasser/rentable/pull/702) [`03d0b8a`](https://github.com/saud-alnasser/rentable/commit/03d0b8ae98066cb48319aba1e6b9619d55780c42) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - a workspace is named by what it is called in the organization, rather than by "primary workspace" in english on every install

- [#753](https://github.com/saud-alnasser/rentable/pull/753) [`6aeb1c2`](https://github.com/saud-alnasser/rentable/commit/6aeb1c2d551acfd5c3c8c6fb9d3e2bb89c5a5a87) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - a workspace file is held to the same rules as the forms it stands in for. a contract costing nothing, a contract whose term is not a whole number of its own billing cycles, a payment of nothing, a payment dated after the day the file is read, and a payment against a contract that has been terminated are each named as the row at fault before anything is written, where before they were written and left a workspace the application itself would refuse to create

- [#582](https://github.com/saud-alnasser/rentable/pull/582) [`756523c`](https://github.com/saud-alnasser/rentable/commit/756523caea16e9da91965f0a63666c542f46c461) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - say so when a change cannot be taken back because its record is no longer there

- [#827](https://github.com/saud-alnasser/rentable/pull/827) [`f56ac57`](https://github.com/saud-alnasser/rentable/commit/f56ac57af993d56a0dc82cc7b1332a3112b71de8) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - an invitation is one link and its code. adding a member hands you a single link to send and six characters to read out, with no password beside them; the person opens the link and chooses their own password, and a link somebody kept opens nothing once it is replaced or the account is removed

- [#679](https://github.com/saud-alnasser/rentable/pull/679) [`a1dbb34`](https://github.com/saud-alnasser/rentable/commit/a1dbb34a3824861954744f545d99c69ac76df47b) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - every list that exports now offers exporting just the records you have selected, in the same columns and under the same file naming as exporting the whole list. the file says how many were selected, so it does not quietly replace the one holding everything

- [#827](https://github.com/saud-alnasser/rentable/pull/827) [`f56ac57`](https://github.com/saud-alnasser/rentable/commit/f56ac57af993d56a0dc82cc7b1332a3112b71de8) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - every screen now uses one name per thing, in both languages: you sign in and sign out, a machine connects to and disconnects from the organization, and the owner connects and forgets the turso account. the sign-in screen's button says sign in rather than unlock, an invitation is said to make somebody a member rather than an account, and the strings the retired organization, workspace and account pages read are gone

- [#688](https://github.com/saud-alnasser/rentable/pull/688) [`9024b14`](https://github.com/saud-alnasser/rentable/commit/9024b14b75031ad7825dec6135ffbbfa333b6bef) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - a complex, unit, contract, payment or tenant form that fails for a reason it cannot explain now says so once rather than raising the same message twice

- [#701](https://github.com/saud-alnasser/rentable/pull/701) [`917cb45`](https://github.com/saud-alnasser/rentable/commit/917cb455fc19c8d87ab1895b2f9e8f305d0d2ae6) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - the settings row in the account menu now opens settings on a machine nobody has signed in on, instead of changing the address and leaving the sign-in card on screen. the language control is the one most people want before they can read their way in, and it works there along with notices, updates and diagnostics

- [#815](https://github.com/saud-alnasser/rentable/pull/815) [`45f9248`](https://github.com/saud-alnasser/rentable/commit/45f92481f57fa6fec523185ff0ecbb309f6c52da) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - signing in after a spell offline now opens the workspace again instead of returning to the same screen, because a new session no longer inherits the expired credential of the one before it

- [#681](https://github.com/saud-alnasser/rentable/pull/681) [`33aeeff`](https://github.com/saud-alnasser/rentable/commit/33aeeff16516e3695732e6e6198777fa4c85d9c9) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - internal: everything the application does between the process starting and a person being able to use it now lives in one unit that can be run without a window, and the eight ways a launch can go are covered by tests rather than by launching the application eight times. nothing about what a launch does has changed

- [#827](https://github.com/saud-alnasser/rentable/pull/827) [`f56ac57`](https://github.com/saud-alnasser/rentable/commit/f56ac57af993d56a0dc82cc7b1332a3112b71de8) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - the account menu at the foot of the rail now holds settings and the way out and nothing else. the row that opened the section about you is gone from it; that section is still reached from the settings rail, from the palette and from the address

- [#825](https://github.com/saud-alnasser/rentable/pull/825) [`9960b46`](https://github.com/saud-alnasser/rentable/commit/9960b4685a622fa4af3fd6b40ca34c3a4df9b014) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - the avatar at the foot of the sidebar and on each row of the organization's members list draws the first two letters of the username, upper-cased, so every account is told apart by the same two letters wherever it is drawn

- [#827](https://github.com/saud-alnasser/rentable/pull/827) [`f56ac57`](https://github.com/saud-alnasser/rentable/commit/f56ac57af993d56a0dc82cc7b1332a3112b71de8) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - the connect screen takes a link and the six-character code that came with it in one form, and where it lands follows the kind of link it was handed: an invitation records the organization, names it, and asks you to choose the password you will sign in with from then on; a link for an account that already has a password connects the machine and leaves it at the sign-in wall, where that password admits you. a link that has lapsed or was withdrawn says to ask whoever invited you for a new one, a link a newer one replaced says so, a link for another organization says to disconnect this machine first, and a link that was already opened says so and offers the sign-in where the organization had already been recorded. text that is not a link and a code that is wrong are each said on the field you correct them on. the sign-in screen of a connected machine offers the connect screen too, under the help it opens, for a link somebody handed you

- [#827](https://github.com/saud-alnasser/rentable/pull/827) [`f56ac57`](https://github.com/saud-alnasser/rentable/commit/f56ac57af993d56a0dc82cc7b1332a3112b71de8) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - the first run's connect step no longer asks you to create a turso group. it says what the consent covers, why a turso account kept for rentable alone is the clean choice on a free or developer plan, and what succession costs.

- [#827](https://github.com/saud-alnasser/rentable/pull/827) [`f56ac57`](https://github.com/saud-alnasser/rentable/commit/f56ac57af993d56a0dc82cc7b1332a3112b71de8) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - the first run names its turso group. the name step asks for the group you picked on turso's consent screen, beside the organization's name, your username and your password, and the first database is created in it. turso began refusing a create that names no group, and on the empty group this walk asks for there is nothing the app can read the name from, so you say which one. a group that is not the one your consent is over is refused before anything is created, naming both, and you retype it on the step you are on. nothing tells you to make a group; the connect step still says what the consent covers and nothing more.

- [#827](https://github.com/saud-alnasser/rentable/pull/827) [`f56ac57`](https://github.com/saud-alnasser/rentable/commit/f56ac57af993d56a0dc82cc7b1332a3112b71de8) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - the first run works out which turso group you picked instead of guessing at it. before creating anything it asks your own account what the group is called: the mcp server, where its tools offer a way to list groups, and otherwise the platform api, whose account endpoint names you and whose groups sit under that name, picking out the group your consent is over by the identity the consent carries. the first database is then created with that name and nothing else is tried. where neither can say, the run falls back to the three names it already tried, no group, turso's default and the group's identity, and the field on the name step is still the last resort after all of that. both new calls only read.

- [#831](https://github.com/saud-alnasser/rentable/pull/831) [`5c2cb42`](https://github.com/saud-alnasser/rentable/commit/5c2cb42a88505db1eb71bb0bc86afb10f86e7167) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - creating the first workspace after setting an organization up no longer fails with the shell's cache out of reach

- [#827](https://github.com/saud-alnasser/rentable/pull/827) [`f56ac57`](https://github.com/saud-alnasser/rentable/commit/f56ac57af993d56a0dc82cc7b1332a3112b71de8) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - the one turso group rentable cannot name on its own is now asked for as a step rather than met as a failure. a group holding nothing yet has no name anywhere the application may read, so the connect screen says beforehand that the next step will ask for it, once. the field itself opens with what to type instead of what turso turned down, its description says the name reads on turso's own consent screen, and turso's account of the refusal sits under the sentence as quiet detail rather than arriving as the loudest line on the screen. everything already typed stays typed, so the group is the only word added. every other account still passes through with no field at all.

- [#825](https://github.com/saud-alnasser/rentable/pull/825) [`9960b46`](https://github.com/saud-alnasser/rentable/commit/9960b4685a622fa4af3fd6b40ca34c3a4df9b014) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - a field that carries a leading glyph (the password on the sign-in screen, a workspace's name) now has the same height, rounding and fill as every other field, instead of a taller bordered box

- [#825](https://github.com/saud-alnasser/rentable/pull/825) [`9960b46`](https://github.com/saud-alnasser/rentable/commit/9960b4685a622fa4af3fd6b40ca34c3a4df9b014) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - the join screen can be left from every step through a back control in the card's corner: from the link field it returns to the sign-in screen, and from anywhere after it returns to the field. the "paste another link" links are gone, the join and restore buttons carry a glyph for what they do, and the link, email and password fields carry one for what they take

- [#831](https://github.com/saud-alnasser/rentable/pull/831) [`5c2cb42`](https://github.com/saud-alnasser/rentable/commit/5c2cb42a88505db1eb71bb0bc86afb10f86e7167) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - the loading screen reports the stage the startup is on, so a slow first pull reads as progress rather than a hung window

- [#825](https://github.com/saud-alnasser/rentable/pull/825) [`9960b46`](https://github.com/saud-alnasser/rentable/commit/9960b4685a622fa4af3fd6b40ca34c3a4df9b014) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - the sign-in screen's password field carries a key glyph and its unlock button carries its own; a machine that has joined several organizations still chooses between them in the dropdown

- [#638](https://github.com/saud-alnasser/rentable/pull/638) [`1ceab14`](https://github.com/saud-alnasser/rentable/commit/1ceab14689921c5cac25935b6ed5c15c9120fe21) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - the sign-in screen reads as a login page: a title, a line under it, and the way in — the coloured box that used to greet every visit now appears only when an attempt actually fails

- [#635](https://github.com/saud-alnasser/rentable/pull/635) [`c652520`](https://github.com/saud-alnasser/rentable/commit/c652520d1da02e0dbc67102a184045413c4d8f3c) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - the sign-in screen names the app, carries one notice box, and says what went wrong in its own words rather than as an error nobody wrote for it

- [#827](https://github.com/saud-alnasser/rentable/pull/827) [`f56ac57`](https://github.com/saud-alnasser/rentable/commit/f56ac57af993d56a0dc82cc7b1332a3112b71de8) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - the sign-in wall is the login page of the organization this machine holds: its name is the heading, "sign in to continue" the line under it, a username and a password the only fields, and "sign in" the one control. the labelled organization line the form carried over the same name is gone. opening a link you were given and disconnecting this machine now sit behind one quiet "trouble signing in?" control at the foot, closed until you ask for it, so neither competes with the form and a person who cannot sign in still reaches both. signing out lands on the wall from wherever you were, the settings page included

- [#831](https://github.com/saud-alnasser/rentable/pull/831) [`5c2cb42`](https://github.com/saud-alnasser/rentable/commit/5c2cb42a88505db1eb71bb0bc86afb10f86e7167) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - what the release review of turso sync found is fixed. two members who chose the same password can both sign in, where the later of them was refused before; a handover re-issues only the certificates the organization key really issued, so a certificate anybody wrote into the directory earns nothing from it; a cost written onto a vault row past what the application ever seals at is refused rather than allocated; signing in over a session already open on the machine signs that one out first, so no remembered key is left behind for nothing to delete; the owner's own machine keeps syncing after it locks somebody out or renews credentials, where it used to stop until a restart; a renewal reads the rows after a pull, so a password reset on another machine is not sealed to a key that is gone; a workspace's schema version is recorded before its migration lease is released, so a second machine does not apply the same migration twice; read-only access on a workspace that is behind says so instead of taking a lease it cannot spend; the machine's sync record is written atomically, so a power loss mid-write no longer leaves a launch that cannot start; a replica whose grant ended is let go of before its file is deleted; a session ended from another machine stops the heartbeat's own push and pull in the same call, and the settings area's sync control and the launch's own pull both raise the wall on it; a sign-in card stays closed while the workspace behind it is being opened, so a second enter does not run the way in twice; disconnecting or deleting the organization from the settings area leaves for the sign-in wall rather than a settings page of nothing; the workspace menu no longer says "0 members" for the run of the process after signing in at the wall; rows another machine pushed during a midnight reconcile are announced rather than dropped; a link handed to the application while the connect screen is already open replaces what the screen holds; a made link says which workspaces it could not carry over, as a reset does; and the route back from an update that will not start opens the release page that exists

- [#705](https://github.com/saud-alnasser/rentable/pull/705) [`99dd59c`](https://github.com/saud-alnasser/rentable/commit/99dd59c5bcbf15a174ac27a2eab1743470efc46f) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - the export and import section of the workspace page is called that, instead of saying "move this workspace" twice in a row above two buttons it did not describe

- [#700](https://github.com/saud-alnasser/rentable/pull/700) [`39389d0`](https://github.com/saud-alnasser/rentable/commit/39389d0267caa23b440d20609e978541af52fabe) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - the updates and diagnostics rows in settings are now controls rather than sections: the version you are on and the version you could have are stated side by side in one treatment, checking is a single icon, and what a check finds is announced and then gets out of the way instead of sitting on the page for the rest of the visit

- [#825](https://github.com/saud-alnasser/rentable/pull/825) [`9960b46`](https://github.com/saud-alnasser/rentable/commit/9960b4685a622fa4af3fd6b40ca34c3a4df9b014) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - the change-password form leads each of its fields with the password's glyph and its button with the verb's, the join screen's password fields carry the same key the sign-in screen does, and the workspaces section on the organization page tells a member who is not the owner that the owner creates a workspace rather than the first one

- [#827](https://github.com/saud-alnasser/rentable/pull/827) [`f56ac57`](https://github.com/saud-alnasser/rentable/commit/f56ac57af993d56a0dc82cc7b1332a3112b71de8) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - the first run stops asking for your turso group. it tries the create without a group, then with turso's default group, then with the group your consent is over, and a group that already holds something names itself; the field only appears if turso turns down all of that, with a line above it saying why. creating your first workspace now hands you straight to the application instead of leaving the form on screen while the machine is read, and a first run you reload after it is finished sends you home rather than back through the steps.

- [#825](https://github.com/saud-alnasser/rentable/pull/825) [`9960b46`](https://github.com/saud-alnasser/rentable/commit/9960b4685a622fa4af3fd6b40ca34c3a4df9b014) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - the sign-in screen is the login page of the one organization this machine holds: it names the organization as a line, asks for a username and a password, each field leading with its glyph, and unlocks; the dropdown and the role are gone from it. a disconnect link at the foot asks once, naming the organization and what this machine loses, and then forgets it here, leaving the screen a machine with nothing shows

- [#825](https://github.com/saud-alnasser/rentable/pull/825) [`9960b46`](https://github.com/saud-alnasser/rentable/commit/9960b4685a622fa4af3fd6b40ca34c3a4df9b014) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - the screen an owner meets when their organization has no workspace yet draws its name field with the workspace's glyph leading it and a plus on the create, and refuses a name that is empty or too long beside the field, with the same sentence every other place a workspace is named will use

- [#683](https://github.com/saud-alnasser/rentable/pull/683) [`ab2bda2`](https://github.com/saud-alnasser/rentable/commit/ab2bda2b7c593b6e4ccabc3eaaa1e619f0de8130) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - every title in the application is cased the way the rest of them already were: the settings, account and workspace pages and their group headings, and each dashboard rank. the seven standalone screens take sentence case instead, because five of them are titled with a sentence rather than a name

- [#682](https://github.com/saud-alnasser/rentable/pull/682) [`2a9606d`](https://github.com/saud-alnasser/rentable/commit/2a9606dce7bf4f0999460adc471c444695de0b8f) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - units can be added to a complex in runs, the way they can when the complex is created: typing `a1-18` on an existing complex names a 1 through a 18 and adds them to the list below, where each one can be corrected or removed, and pressing create writes the whole list as one change that one undo takes back

- [#732](https://github.com/saud-alnasser/rentable/pull/732) [`8189b96`](https://github.com/saud-alnasser/rentable/commit/8189b966b94ad3cbfc2a844df13abb9cf464b321) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - the two version numbers on the update-recovery screen now read left to right in Arabic, so a version carrying a suffix like `1.2.3-beta.1` is no longer reordered on screen, while the words that stand in for a version when there is none still read in the reader's direction

## 0.13.0

### Minor Changes

- [#534](https://github.com/saud-alnasser/rentable/pull/534) [`c6194dd`](https://github.com/saud-alnasser/rentable/commit/c6194dd656c6c7ec7a552994c7e6013426d304b6) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - read a file back into a directory: the tenants directory now imports the csv or excel file it exported, from the same menu the export lives on. an import shows what it would create and what it would turn away — naming the row and the reason for each — and writes nothing until it is confirmed. a file whose own rows claim the same tenant twice is refused whole, with both rows named, rather than half-applied

- [#528](https://github.com/saud-alnasser/rentable/pull/528) [`4c5f49a`](https://github.com/saud-alnasser/rentable/commit/4c5f49a75d5c4c25d9b8f76169517cf82825140d) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - narrow a list from its toolbar: every contracts list — the directory, a tenant's page and a unit's — can now be narrowed to what needs attention, and a contract's payment statement to a period. filtering changes what the read returns rather than hiding rows already on screen, so the result count is the truth. the filter and sort controls fill in while they are in use, so a list never quietly shows a subset

- [#530](https://github.com/saud-alnasser/rentable/pull/530) [`16c3be7`](https://github.com/saud-alnasser/rentable/commit/16c3be742815b4efd03967738693a87771f581e1) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - act on several contracts at once: turn on selection from the contracts toolbar, tick the ones you mean — or shift-click for a run — and terminate all of them with one confirmation. anything that could not be terminated is named rather than silently skipped, and one undo takes the whole action back

- [#532](https://github.com/saud-alnasser/rentable/pull/532) [`b23aeb2`](https://github.com/saud-alnasser/rentable/commit/b23aeb22f2630ffbe762a23857177d66796667ff) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - see what happened to a record and when, on a history tab beside its payments and units — and still see it after closing the app. undo and redo are recorded too, so an account never shows a change while staying silent about it being taken back

- [#536](https://github.com/saud-alnasser/rentable/pull/536) [`7625dd0`](https://github.com/saud-alnasser/rentable/commit/7625dd06dbfb988811d9a76401e339681d2dffcb) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - a whole workspace now moves as one file. settings writes every tenant, complex, unit, contract and payment to a single workbook — one sheet each — and reads one back. a record names what it points at by name rather than by row number, so a unit names its complex, a contract names its tenant and the units it holds, and a payment names its contract: the file opens on a machine that has never seen this database. the import shows what each sheet would do before anything is written, and a row naming a record no sheet holds refuses the whole file rather than importing the half that resolved. what does go in goes in as one write, so a refusal anywhere leaves the workspace exactly as it was

- [#539](https://github.com/saud-alnasser/rentable/pull/539) [`5fe0822`](https://github.com/saud-alnasser/rentable/commit/5fe08223769bdaad3c86249befb20c06a5dd1c3a) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - an export now asks where the file goes. every one of them — each directory's, and the whole workspace's — opens the save dialog before it writes anything, so a file lands on the drive it is being carried on or in the folder the work it feeds already lives in, rather than in downloads to be moved afterwards. the name the export already composes is what the dialog opens on, extension and all, so a reader with no opinion presses one control and is done; walking away from the dialog writes nothing and says nothing, because that is not a failed export. this is the same shape the import direction has always had — it asks which file to read, and now the other half asks which file to write

- [#535](https://github.com/saud-alnasser/rentable/pull/535) [`bbcbc50`](https://github.com/saud-alnasser/rentable/commit/bbcbc50a14c232c4c9e50a46d5bcd15acef59ac3) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - an exported file now reads as a document rather than as the table behind it. money, counts and dates arrive as figures a spreadsheet can total, sort and filter — they used to arrive as text rendered through the interface's own locale, which no spreadsheet could add up. headings are written for a file, a units file names the complex holding them and a payment statement names its contract and its tenant, a contract's paid and expected amounts are two columns instead of one fraction, and a file narrowed by a search or a filter says so in its name rather than silently replacing the last one

- [#526](https://github.com/saud-alnasser/rentable/pull/526) [`92c15fa`](https://github.com/saud-alnasser/rentable/commit/92c15fa88b508c792079419020e9ad84dc40c5bd) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - move through any list from the keyboard: press `/` to search it, the arrow keys to move between records, and enter to open the one you are on

- [#537](https://github.com/saud-alnasser/rentable/pull/537) [`1d71566`](https://github.com/saud-alnasser/rentable/commit/1d7156653822a41c3aca1ab699685c8104f5a978) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - every directory now reads a file as well as writing one. complexes, units, contracts and payments join tenants on the same import item, and all five share one preview: what would be created, what was turned away and why as counts rather than as a transcript, and the few rows worth going and fixing named. a row names what it belongs to the way a person would — a unit names its complex, a contract names its tenant and the units it holds, a payment names its contract — resolved against the workspace before anything is written, and a row naming a record the workspace does not hold is turned away with the name it could not find while the rest of the file still goes in. what a file of each concept is is declared once and read by both directions, so the file a list exports is a file that list can read: imported back it reports every row as already here and creates nothing, which is what stops an export of a directory from quietly doubling it. the tenants import moves onto that shared path and no longer offers to undo itself — a file's worth of records is taken back by restoring a backup rather than off a toast. payments read into a statement now move the contract they are against, including one that was already here

- [#529](https://github.com/saud-alnasser/rentable/pull/529) [`65dc174`](https://github.com/saud-alnasser/rentable/commit/65dc1747b017a45f68ab945c07e7fc4b58e779de) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - ask the landing screen about a period other than this month: the collected and expected figures now take the same period the payment statement does, and report the same money over it. fixes a figure that stopped at midnight on the last day of the month, so a payment taken that afternoon was money the statement listed and the band did not count

- [#527](https://github.com/saud-alnasser/rentable/pull/527) [`73aa070`](https://github.com/saud-alnasser/rentable/commit/73aa07068b26610f7017f415010d980adfc0737e) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - run an action from the command palette instead of going to the surface that owns it: type its name and it runs where you are standing. an action that acts on a record — renewing a contract — asks which one inside the palette, and one that cannot run right now says so with the reason rather than doing nothing

- [#520](https://github.com/saud-alnasser/rentable/pull/520) [`8aa4574`](https://github.com/saud-alnasser/rentable/commit/8aa4574145ee131f10d55a0f154bc5f2dd4843f8) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - renew a contract into a successor that continues its term. the renewals queue and a contract's own page both offer it, and the renewal carries the tenant, units, cycle and cost over a term you can adjust before it is created. the contract being renewed is never changed, a renewal whose units are already taken over the new term is refused with the reason, and the whole thing can be undone.

- [#519](https://github.com/saud-alnasser/rentable/pull/519) [`bb5d139`](https://github.com/saud-alnasser/rentable/commit/bb5d139ba7a655437626277c9e4147c6858a9a8b) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - add a keyboard shortcuts sheet, opened from the title bar and listing every shortcut the application answers, in the active locale

- [#531](https://github.com/saud-alnasser/rentable/pull/531) [`64b90aa`](https://github.com/saud-alnasser/rentable/commit/64b90aa014aa946d298dc40dfe1a444d7142b6a3) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - export a list as an excel workbook as well as csv: the toolbar's export icon is now a menu that names the direction and the format. arabic text and the figures as your locale renders them survive into both, and no cell is handed to a spreadsheet as a formula

### Patch Changes

- [#518](https://github.com/saud-alnasser/rentable/pull/518) [`ab11468`](https://github.com/saud-alnasser/rentable/commit/ab11468f6ccf7d2b728a314916c53ed044f78336) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - search now finds a record however it is spelled: a number typed the way the screen renders it — Arabic-Indic digits, or grouped with a comma — and an Arabic name written with any alef, with or without diacritics, tatweel or a taa marbuta. Every directory, the units board and the command palette match the same way. A narrowed list searched from its search box also stays narrowed: searching one tenant's contracts, or one contract's payments, no longer returns records belonging to another.

- [#533](https://github.com/saud-alnasser/rentable/pull/533) [`d75fb1b`](https://github.com/saud-alnasser/rentable/commit/d75fb1ba44049a141afb96e378d2933385cd046e) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - amounts now carry the saudi riyal symbol rather than the word `sar`, and the symbol sits to the left of the figure in both arabic and english

## 0.12.1

### Patch Changes

- [#510](https://github.com/saud-alnasser/rentable/pull/510) [`2ed539d`](https://github.com/saud-alnasser/rentable/commit/2ed539da62f32918da194c2bac5a795ccdb5dca8) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - every release is now titled after the package it was cut from — `@rentable/desktop v0.12.1` where
  it used to read `rentable v0.12.1` — so the releases page, the tag and the changelog all name the
  same thing. nothing about the application itself has changed

## 0.12.0

### Minor Changes

- [#363](https://github.com/saud-alnasser/rentable/pull/363) [`1551d72`](https://github.com/saud-alnasser/rentable/commit/1551d729142ca17979e920538fbe026efe6141b6) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - enter a complex and its units together — the whole thing is created in one go, or not at all

- [#437](https://github.com/saud-alnasser/rentable/pull/437) [`c81d174`](https://github.com/saud-alnasser/rentable/commit/c81d1740f79b228fe41f9f778ac96dacac4c98fa) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - creating a complex now opens an edge sheet, and its units are described in one line rather than
  one at a time: "a 1-18" adds eighteen named units, each of which stays editable and removable on
  its own afterwards. editing an existing complex is unchanged

- [#434](https://github.com/saud-alnasser/rentable/pull/434) [`7b4608b`](https://github.com/saud-alnasser/rentable/commit/7b4608b9ea18ebb1046bd17f213ff8b7e84cf20e) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - a complex's record now states how many units it holds, how many are occupied, how many are
  vacant, and how many contracts run against those units today — where it used to state only the
  unit total

- [#401](https://github.com/saud-alnasser/rentable/pull/401) [`2867c5d`](https://github.com/saud-alnasser/rentable/commit/2867c5d4d91f9206adc591d593d057946d44092a) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - deleting a record, and terminating a contract, no longer wear a warning colour while you are just
  reading the record — they take it when you reach for them, and the confirmation each opens still
  asks in red

- [#366](https://github.com/saud-alnasser/rentable/pull/366) [`9d0af5e`](https://github.com/saud-alnasser/rentable/commit/9d0af5eee941d9f263324f6e6d21b6d4263363eb) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - export a directory to a spreadsheet file — exactly the rows on screen, under the search and order they are shown in

- [#431](https://github.com/saud-alnasser/rentable/pull/431) [`69eede5`](https://github.com/saud-alnasser/rentable/commit/69eede516b028f2433951c3263855991f87c580d) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - the tenants and complexes lists now colour a count when what it counts is live — a tenant
  holding a running contract, a complex with units let — instead of rendering every figure in the
  same grey. a complex row also says how many of its units are occupied, not only how many there
  are and how many are free, and the unit total is drawn as a grid of spaces rather than as a door

- [#432](https://github.com/saud-alnasser/rentable/pull/432) [`65215b3`](https://github.com/saud-alnasser/rentable/commit/65215b376f4be1ae19f34edc9c51a7b78e6daeb3) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - a tenant's phone number has moved out from under their name and into the field list, labelled,
  directly beneath the national identity number. the two are both digit strings, and reading one
  of them off a screen holding the other was a matter of guessing from the format

- [#436](https://github.com/saud-alnasser/rentable/pull/436) [`de64759`](https://github.com/saud-alnasser/rentable/commit/de647591981d23b17376d423552c531074bfc152) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - a diverged workspace's two copies are now the choice itself: select the copy to keep, and one
  control in the corner of the question acts on it. each copy states what it is and when it was
  last written without needing a pointer, and leaving the question unanswered moves out to the
  corner of the card that raised it

- [#350](https://github.com/saud-alnasser/rentable/pull/350) [`5274956`](https://github.com/saud-alnasser/rentable/commit/52749564e1e1a581d5a296b9f5306fdb175c6bf5) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - assigning units to a contract now opens the shared form surface, instead of a panel sitting inside the contract's units tab, and that tab becomes a directory whose rows open a unit's page. when a contract is terminated or already has a payment recorded, the assign and remove controls are absent and a notice says which rule applies — rather than letting you try and then refusing.

- [#367](https://github.com/saud-alnasser/rentable/pull/367) [`1a5d0ad`](https://github.com/saud-alnasser/rentable/commit/1a5d0adc3b5954c4902494b10cfcad201c070fb1) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - back on a record now returns to the screen you opened it from, not to a fixed directory

- [#263](https://github.com/saud-alnasser/rentable/pull/263) [`5539a72`](https://github.com/saud-alnasser/rentable/commit/5539a728151eec392ec6f7e0bd3540b3c7d52e0c) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - the interface is black and high-contrast now. the frosted-glass panels, the coloured glow behind the window and the tinted gradient under everything are gone, and surfaces separate by their own weight instead — each panel a step lighter than what holds it, over a hairline edge. blue no longer tints the furniture: it marks the tab you are on, the row you picked and the field you are typing in, and nothing else. controls are a step shorter throughout, so a form or a menu shows more at once.

- [#264](https://github.com/saud-alnasser/rentable/pull/264) [`13b6870`](https://github.com/saud-alnasser/rentable/commit/13b6870635a70efaf0c566e349a26df3558faa15) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - navigation moved into a collapsible sidebar down the side of the window, replacing the row of icons in the title bar. it collapses to icons and back with the button beside the breadcrumbs or ctrl+b, it remembers which way you left it, and it sits on the right in arabic. the title bar now carries the breadcrumb trail for where you are, and dragging the window and the minimise, maximise and close buttons follow the reading direction with it. the window can no longer be resized smaller than 640×480, which is the narrowest the layout is built to hold. creating and editing a tenant opens in a panel that slides in from the side instead of a box in the middle of the screen — the rest of the forms follow as their lists are rebuilt.

- [#285](https://github.com/saud-alnasser/rentable/pull/285) [`74969c8`](https://github.com/saud-alnasser/rentable/commit/74969c8ff2f37507629f47b062d0db269404fbee) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - the complex and payment forms open on the shared form surface. both are still a panel in the middle of the window, but they now use the full width of a narrow window instead of a fixed column, they keep everything you have typed if you resize while one is open, and they carry the same header, footer and scrolling as every other form. an amount with more than two decimal places is now refused in your own language, in the form, where the rest of the errors already appear — the browser used to refuse it in english with a bubble of its own.

- [#349](https://github.com/saud-alnasser/rentable/pull/349) [`1c73468`](https://github.com/saud-alnasser/rentable/commit/1c73468fe1982595ab59abf5544053624cffafa9) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - a complex lists its units as a directory, the same shape every other record uses, and a row opens that unit's page. where a tile said occupied or vacant through its border, a row says it in words — the tenant's name, or vacant.

- [#286](https://github.com/saud-alnasser/rentable/pull/286) [`73aae04`](https://github.com/saud-alnasser/rentable/commit/73aae04ea97299f45c1c089acaed23fbd394bab8) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - the contract and unit forms open on the shared form surface, which is now the only way a form opens anywhere in the application. the contract form arrives from the side of the window instead of sitting in a box in the middle, and the unit form is a panel like the complex and payment ones. a cost with more than two decimal places is refused in your own language, in the form, where the rest of the errors already appear — the browser used to refuse it in english with a bubble of its own.

  the contract form is also rebuilt inside. it opens with a summary of the contract you are making — the tenant, the total, and the period — which stays in view as you scroll and fills in as you type, so you can see what you are about to create without reading it back off the fields. the fields themselves sit in one column, cut into the panel rather than stacked as boxes on top of it, and the tenant picker opens showing your tenants instead of asking you to start typing first.

  every form now tells you where a problem is. a field that needs fixing turns red and carries a mark, and hovering or tabbing to it shows what is wrong — replacing the list of messages that used to collect at the bottom of the panel, which told you what was wrong but never which box to fix.

- [#346](https://github.com/saud-alnasser/rentable/pull/346) [`ec54915`](https://github.com/saud-alnasser/rentable/commit/ec54915685b6a2180dc2691bbebfb6627debdf42) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - a contract row shows how far through paying it is, as a ring with the percentage at its centre, in place of the cost per interval. the amounts and the cost with its interval move into the tooltip. the ring fills once when the row's figures arrive, and stays still if you have asked for reduced motion. cost is still what you can sort and search by.

- [#300](https://github.com/saud-alnasser/rentable/pull/300) [`7f004b2`](https://github.com/saud-alnasser/rentable/commit/7f004b2525a3049427e8b2bdbd9163ac0e5a680c) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - the contracts list reads as a directory rather than a triage queue. the status headings are gone and every contract sits in one list, so scheduled and expired contracts no longer take a heading of their own. a row leads with the tenant, carries the contract number and the period it runs over beneath, and ends with the status and the cost — the cost shown with the interval it is charged over, so the figure is not mistaken for what the whole contract is worth.

  the list can be ordered by tenant, by contract number, by start, by end, by cost, or by status, and the order is the database's rather than the screen's. ordering by status follows what needs you first — defaulted, active, scheduled, then fulfilled, expired and terminated — rather than the alphabet. contracts tied on the chosen order fall back to tenant name and then to when the contract runs.

  searching still runs in the database and still finds a contract by phone or tenant even though a row does not show them.

- [#274](https://github.com/saud-alnasser/rentable/pull/274) [`1050eea`](https://github.com/saud-alnasser/rentable/commit/1050eeacb894961948f27a0ab87249809ef20068) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - the contracts list opens as a queue rather than a grid of cards. contracts are grouped by what needs you first — defaulted, then active, then scheduled, with fulfilled, expired and terminated below them — and inside each group the soonest end date leads. a row carries the tenant, how much of the contract has been paid, and when it ends, and opens the contract.

  searching runs in the database now instead of over everything already loaded. it still finds a contract by government id, phone, cost or interval even though a row no longer shows those, and a search containing % or _ looks for those characters rather than treating them as wildcards. the whole list arrives at once, so there is no more loading as you scroll.

  progress bars fill from the right in arabic, where they used to fill from the left.

- [#345](https://github.com/saud-alnasser/rentable/pull/345) [`ebde6da`](https://github.com/saud-alnasser/rentable/commit/ebde6da805ab5d45f0a26050b58d7ca363473cba) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - the counts on a row — a tenant's contracts, a complex's units — now say what they are counting when you hover them, instead of only telling a screen reader. a contract row also shows how many payments have been recorded against it.

- [#351](https://github.com/saud-alnasser/rentable/pull/351) [`0ead2ad`](https://github.com/saud-alnasser/rentable/commit/0ead2ad923424b953911059650b717ff0499c3cd) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - all five forms now read the same way, with their controls cut into the surface rather than sitting in a bordered box. the tenant form pins a read-out of the identity being entered, and the payment form one showing what the contract still owes beside what it would owe once the payment lands.

- [#265](https://github.com/saud-alnasser/rentable/pull/265) [`694673b`](https://github.com/saud-alnasser/rentable/commit/694673b31879cfac00a0aad7b200bef55035f480) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - a command palette opens over the app with ctrl+k, or from the search button beside the breadcrumbs. type a few letters to jump to the dashboard, tenants, complexes, contracts or settings, or to start a new tenant, complex or contract — starting one takes you to its list and opens the form there. it searches whatever language the app is in, and reads right to left in arabic.

- [#299](https://github.com/saud-alnasser/rentable/pull/299) [`6d0c9ec`](https://github.com/saud-alnasser/rentable/commit/6d0c9ec4616542897642ad333bab63a1552903ef) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - make the landing screen the day's work: the contracts needing action open as a queue grouped
  overdue, owing, then ending soon, each heading stating its contract count and its money total.
  a contract joins a money group when it owes anything today rather than when a payment fell due
  this calendar month, so a contract behind by cycles from earlier months is no longer hidden.
  clicking a money row opens the payment form with the contract already chosen; the fifteen
  portfolio figures are replaced by two — this month's collected against due, and occupied
  against total units.

- [#400](https://github.com/saud-alnasser/rentable/pull/400) [`d109cd5`](https://github.com/saud-alnasser/rentable/commit/d109cd5754b43f697c1c7b702808955bd69fae49) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - every screen now occupies the same width with the same padding, so the application stops changing
  shape as you move through it, and a border comes out wherever a background step was already doing
  the separating

- [#353](https://github.com/saud-alnasser/rentable/pull/353) [`2f23eed`](https://github.com/saud-alnasser/rentable/commit/2f23eede06642762e10f0a276bb165b08da47ab8) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - a payment has its own page — what it was, when, and the contract and tenant it belongs to, with a link back to the contract. a ledger line opens it, in place of a row menu. editing and deleting are still there, and are still refused on a terminated contract.

- [#298](https://github.com/saud-alnasser/rentable/pull/298) [`a701777`](https://github.com/saud-alnasser/rentable/commit/a70177767c0276fbc1ab99e0b8e02e24e5559a10) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - a contract's payments read as a ledger rather than a grid of cards. rows are grouped by the month they were made in, newest first, each row carrying its date with the amount trailing it, and each month carrying what its payments add up to.

  the foot of the ledger states what the contract still owes against what it is worth in total, taken from the figures the contract already keeps rather than added up from the rows on screen — so a search never changes the balance.

  searching the ledger is answered by the database in one query, over the amount and the day a payment was made, and the whole ledger arrives at once instead of loading as you scroll. adding, editing and deleting a payment still work from it, and a terminated or fully paid contract still says why it will not take one.

- [#297](https://github.com/saud-alnasser/rentable/pull/297) [`72ef95f`](https://github.com/saud-alnasser/rentable/commit/72ef95f3da0fc4235b5952c628770c690fdf411a) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - the complexes list reads as a directory rather than a grid of cards. a row leads with the name, carries the location beneath it, and shows how many units the complex holds and how many of those stand vacant — so a screen shows the buildings you were scrolling past. the list can be ordered by name, by location, by unit count or by vacant count, and the order is the database's rather than the screen's.

  the units inside a complex read as an occupancy board: a tile per unit, laid out across the window and reflowing as it resizes. a let unit is a solid tile naming the tenant living in it; a free one is a dashed tile that says vacant. searching the board reaches the tenant's name as well as the unit's.

  both lists arrive at once, so there is no more loading as you scroll, and the unit and vacant counts come from the same query as the rows rather than from a count per building.

- [#354](https://github.com/saud-alnasser/rentable/pull/354) [`c4b2711`](https://github.com/saud-alnasser/rentable/commit/c4b27110a8cca52b5dffee88d7f223433fea49c9) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - a row on the landing screen now opens its contract, the way every other row in the app opens its record, rather than opening the payment form with the contract already chosen. recording a payment from there is two clicks instead of one. the groups, their ordering, and the selectable phone number are unchanged.

- [#365](https://github.com/saud-alnasser/rentable/pull/365) [`9af422e`](https://github.com/saud-alnasser/rentable/commit/9af422ec72e5ec8e79d058328aa0912264524323) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - copy a record's details to the clipboard from its own page, and start a new record from an existing one

- [#357](https://github.com/saud-alnasser/rentable/pull/357) [`1697819`](https://github.com/saud-alnasser/rentable/commit/169781997cf4439cdc4ae9bdf3fbd0ffa089df15) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - the workspace and sync section reads as rows like the rest of settings, and the Drive usage figures appear once instead of twice. a pending conflict is worded the same way wherever it is raised.

- [#356](https://github.com/saud-alnasser/rentable/pull/356) [`54c5493`](https://github.com/saud-alnasser/rentable/commit/54c5493b746484fff57103ae0fd3a6131531e339) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - settings is one column in four groups — general, workspace, updates, diagnostics — instead of a strip of tiles above a grid of cards. the tiles are gone rather than restyled: every figure on them was already stated by the section that owns it, and the version now lives in updates and nowhere else.

- [#355](https://github.com/saud-alnasser/rentable/pull/355) [`a29f687`](https://github.com/saud-alnasser/rentable/commit/a29f687841b528acd306510c49dfdde4c91181f1) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - the screens the app shows about itself — starting up, failing to start, recovering, choosing a workspace, and the one you meet when something breaks unexpectedly — now share one surface and one width, instead of six that each picked their own. the error screen gains a sentence in your language and a way back, where it used to print a status code and nothing else.

- [#344](https://github.com/saud-alnasser/rentable/pull/344) [`f256ba4`](https://github.com/saud-alnasser/rentable/commit/f256ba4cde791eb5e01884b3e7097c601c408b1b) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - a status is now an icon rather than a word in a badge, everywhere one is shown — a contract's, a unit's, a payment's. hover it, or reach it with a screen reader, and it names itself and says what it means. the icons are a set rather than nine separate pictures: being paid in full reads as a check, and what still owes carries a clock or an alert.

- [#284](https://github.com/saud-alnasser/rentable/pull/284) [`c6cfcaf`](https://github.com/saud-alnasser/rentable/commit/c6cfcafe05966d905142a609d0d826ac64ec8ef4) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - the tenant form opens on the shared form surface. it is still the panel that slides in from the side, and it still reads from the right in arabic, but it now uses the whole width of a narrow window instead of sitting in a fixed column with empty space beside it, and it keeps everything you have typed if you resize the window while it is open.

- [#347](https://github.com/saud-alnasser/rentable/pull/347) [`6f1edc5`](https://github.com/saud-alnasser/rentable/commit/6f1edc53a10b636886b2902f128ef144a7264458) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - a tenant's profile now has tabs, and the contracts tab lists what that tenant rents — searched and sorted the same way the contracts directory is, minus the tenant column, which holds the same name on every row there.

- [#290](https://github.com/saud-alnasser/rentable/pull/290) [`b02fa15`](https://github.com/saud-alnasser/rentable/commit/b02fa1524577e627b9b9c6ac8e17a25defbcb4b3) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - the tenants list reads as a directory rather than a grid of cards. a row leads with the name, carries the national id and phone beneath it, and shows how many contracts that tenant currently holds — so a screen now shows the people you were scrolling past.

  the list can be ordered by name, by national id, or by how many contracts a tenant holds, and the order is the database's rather than the screen's. a contract counts as held while its period covers today and nobody has ended it by hand; a contract that is paid up still counts, one that has expired does not.

  the whole list arrives at once, so there is no more loading as you scroll.

- [#397](https://github.com/saud-alnasser/rentable/pull/397) [`a421986`](https://github.com/saud-alnasser/rentable/commit/a42198666424e7e7d40827ae7d033e25831acb19) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - a complex and a unit read on the shared record surface: no panel, no field tiles, their units
  and contracts under their own heading with no tab to press, and a way back from a record that
  cannot be found

- [#438](https://github.com/saud-alnasser/rentable/pull/438) [`493203b`](https://github.com/saud-alnasser/rentable/commit/493203bfd0fcda8b25eb4932bc302c4f190bbfd5) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - the dialog that asks before something is destroyed is rebuilt: the action names it, the record
  leads the sentence below, and the destructive control is the primary one inside it. where
  something depends on the record there is no destructive control at all — only what blocks it,
  and a way out

- [#399](https://github.com/saud-alnasser/rentable/pull/399) [`17054c3`](https://github.com/saud-alnasser/rentable/commit/17054c382cc4505f2965ef9ec861db19bd0f4f02) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - a contract reads on the shared record surface: its tenant, period and status lead, its six fields
  read as aligned rows rather than bordered tiles, opening it lands on its payments with its units
  one quiet choice away, and neither terminating nor deleting is the loudest thing on the screen

- [#389](https://github.com/saud-alnasser/rentable/pull/389) [`dbd17b1`](https://github.com/saud-alnasser/rentable/commit/dbd17b1fe74193fa2321654dd93e3451a889fbc3) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - the contracts list can be narrowed to the contracts that are overdue, behind, or ending soon — the same three ranks the landing screen files them under — and the filter sits in the list's toolbar beside its search and its order

- [#368](https://github.com/saud-alnasser/rentable/pull/368) [`dc717ee`](https://github.com/saud-alnasser/rentable/commit/dc717eea3f044ba4786f8d6f232b8ae38d516e1b) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - the delete confirmation names the record and, where something depends on it, says what — and offers nothing destructive

- [#389](https://github.com/saud-alnasser/rentable/pull/389) [`dbd17b1`](https://github.com/saud-alnasser/rentable/commit/dbd17b1fe74193fa2321654dd93e3451a889fbc3) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - the landing screen is a band of figures over sections of records. collection this month and occupancy are rings carrying their own percentage, outstanding sits beside them, and each one opens the page holding its detail. below them is one card per attention rank — overdue, owing, ending soon — stating what the rank holds, what it owes, and a few of its contracts, with a way through to the rest that opens the contracts list narrowed to that rank. the band stays put while the cards are worked, a rank holding nothing shows no card, and a morning with nothing to do says so.

- [#364](https://github.com/saud-alnasser/rentable/pull/364) [`cdd2518`](https://github.com/saud-alnasser/rentable/commit/cdd2518187a6164b1671aa9bc7fd636a3e43af64) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - find any tenant, complex, unit, contract or payment from the command palette, wherever you are, and open it

- [#398](https://github.com/saud-alnasser/rentable/pull/398) [`9c4c9ff`](https://github.com/saud-alnasser/rentable/commit/9c4c9ffb1046dd881567e40384fdab3921133269) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - a payment reads on the shared record surface: its amount and date lead without labels, the rest
  reads as aligned rows rather than bordered tiles, and nothing offers a section to choose because
  a payment has none

- [#396](https://github.com/saud-alnasser/rentable/pull/396) [`3ac93a3`](https://github.com/saud-alnasser/rentable/commit/3ac93a34e72ef0d202e0cdacacd996cb04feca2c) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - a tenant's record reads on the shared record surface: no panel behind it, its name and phone
  leading without labels, its national id as an aligned specification row rather than a bordered
  tile, its contracts under their own heading with no tab to press, and a way back from a record
  that cannot be found

- [#389](https://github.com/saud-alnasser/rentable/pull/389) [`dbd17b1`](https://github.com/saud-alnasser/rentable/commit/dbd17b1fe74193fa2321654dd93e3451a889fbc3) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - a contract's units are added and removed on the tab that lists them: what it holds sits beside what it could hold, a row still opens its unit, and each move is saved as it happens — the assignment dialog and the `+` that promised to add a single unit are both gone

- [#362](https://github.com/saud-alnasser/rentable/pull/362) [`becd400`](https://github.com/saud-alnasser/rentable/commit/becd40006d2174e64f6c999ca19362c74bf79040) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - take back a change to which units a contract holds, and take back terminating one

- [#360](https://github.com/saud-alnasser/rentable/pull/360) [`21a1db2`](https://github.com/saud-alnasser/rentable/commit/21a1db2d09f208795b9e85374fd2ebfeb03cff02) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - take back a record you just created, edited or deleted — and apply it again — from the shell or with ctrl+z, for as long as the session lasts

- [#348](https://github.com/saud-alnasser/rentable/pull/348) [`48fcc24`](https://github.com/saud-alnasser/rentable/commit/48fcc24624f42c6b792b1587b6e5da9b465bd345) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - a unit has its own page: what it is, which complex holds it, and the contracts that have mentioned it. it is reached from its complex's units, and each contract listed on it opens that contract's page. the unit route no longer bounces you back to the complex.

- [#361](https://github.com/saud-alnasser/rentable/pull/361) [`b2cd239`](https://github.com/saud-alnasser/rentable/commit/b2cd2391485ad81d70eeacda9f2085366438a4f8) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - choose a contract's units on one surface — what is available on one side, what it holds on the other, across complexes, searchable, saved once

### Patch Changes

- [#441](https://github.com/saud-alnasser/rentable/pull/441) [`efbdd6f`](https://github.com/saud-alnasser/rentable/commit/efbdd6f5959144252e9371c9cf3179fe18c58893) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - buttons show a pointer cursor on hover. every button in the application showed the ordinary arrow
  instead, which reads as something you cannot press

- [#486](https://github.com/saud-alnasser/rentable/pull/486) [`0bdfff8`](https://github.com/saud-alnasser/rentable/commit/0bdfff8d804e382c5be65db48dfe1ff7223f9aff) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - right-clicking a record card and pressing the control on it now open the same-looking menu. The
  context menu had kept the corner, border and shadow it was generated with, so a card's two ways
  into one list of actions looked like two different components

- [#389](https://github.com/saud-alnasser/rentable/pull/389) [`dbd17b1`](https://github.com/saud-alnasser/rentable/commit/dbd17b1fe74193fa2321654dd93e3451a889fbc3) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - a confirmation offers its confirming control unless something is known to block the operation — terminating a contract, restoring a terminated one, and deleting a payment all work again, and a refused deletion can be attempted again without dismissing the dialog

- [#485](https://github.com/saud-alnasser/rentable/pull/485) [`45a2bf5`](https://github.com/saud-alnasser/rentable/commit/45a2bf505e2b7e2075ec6de7b1624494eb50278a) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - a contract listed on a tenant's page offers the same actions a contract in the directory offers,
  from the control on the card and from a right-click — so all three places a contract can be met
  now agree about what may be done to it and what it is refused for

- [#484](https://github.com/saud-alnasser/rentable/pull/484) [`0fbadd0`](https://github.com/saud-alnasser/rentable/commit/0fbadd0a8ad4e3f1ac54bba1bcdd58ad4dd0f6bf) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - a contract listed on a unit's page offers what a contract in the directory offers — duplicating,
  editing, terminating or restoring it where its status allows, and deleting it — from the control
  on the card and from a right-click, each behind the same confirmation and refused for the same
  reasons. Acting on one updates the page without a reload, and deleting a contract anywhere no
  longer leaves back pointing at the record that is gone

- [#455](https://github.com/saud-alnasser/rentable/pull/455) [`36c0b4e`](https://github.com/saud-alnasser/rentable/commit/36c0b4e44826fe83c9de571d53e7e1cbde61165b) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - the figures on a directory row line up in straight columns down the list, whatever they count and
  however many digits they hold. the complexes row's three counts and the tenant row's six used to
  leave a ragged trailing edge, because each figure was only as wide as its own digits

- [#444](https://github.com/saud-alnasser/rentable/pull/444) [`6ff38fa`](https://github.com/saud-alnasser/rentable/commit/6ff38fa881a2d3fb538e6a9bf101b2b262431743) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - a record in the contracts, complexes, tenants, units and payments lists reads as a card — space
  around it, a resting shadow, and a lift when the pointer is over it — instead of a banded row in a
  framed table. a month in the payments statement is named by a card of its own, sized to what it
  says, scrolling with the payments under it rather than pinning above them

- [#435](https://github.com/saud-alnasser/rentable/pull/435) [`f32ad2f`](https://github.com/saud-alnasser/rentable/commit/f32ad2f1e7e965dcbe6724e8cf0ce847bdf03e97) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - the startup screen that asks which workspace copy to keep no longer prints the conflict's title
  and description twice — they are read once, in the card that carries the answer

- [#457](https://github.com/saud-alnasser/rentable/pull/457) [`fc87831`](https://github.com/saud-alnasser/rentable/commit/fc87831e97051760c9ab0caa40edd1a7dc3ae055) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - a contract whose units cannot be changed shows only the units it holds, laid out across the width as
  a grid, instead of also listing every unit that could be assigned beside a control that has been
  removed. both unit panes now render only the rows on screen

- [#450](https://github.com/saud-alnasser/rentable/pull/450) [`b0533a3`](https://github.com/saud-alnasser/rentable/commit/b0533a3c3a80bed098dc11658adfaedd9ada6e71) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - a page taller than the window now scrolls to a bottom with space beneath its last element instead of
  ending flush against the window edge. settings is where this showed, being the longest page, but the
  fault was the shell's and reached every page that scrolls

- [#452](https://github.com/saud-alnasser/rentable/pull/452) [`f22bcde`](https://github.com/saud-alnasser/rentable/commit/f22bcde7ed456bea3b975d110499f63451448585) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - a payment dated after today is refused, whether it is being recorded or edited, so money nobody has
  yet cannot move a contract's status. the date picker stops offering a day later than today, and
  nothing bounds how far into the past a payment may be dated

- [#440](https://github.com/saud-alnasser/rentable/pull/440) [`4956df1`](https://github.com/saud-alnasser/rentable/commit/4956df13c74c67d096849af523f6cd3a8ec8a74f) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - a record's action controls are styled in one place, so the tenant, complex, unit, payment and
  contract records cannot come to disagree about what the same control looks like. nothing about
  how they read changes

- [#481](https://github.com/saud-alnasser/rentable/pull/481) [`fd66aa1`](https://github.com/saud-alnasser/rentable/commit/fd66aa17426639a03e9b1a6dab899be7dff1cad4) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - a tenant card in the directory carries a quiet control at its inline end, opening the same actions
  a right-click on the card opens — so the actions are reachable from the keyboard, and the card no
  longer keeps them behind a gesture with nothing on it to say so. Clicking the card still opens the
  tenant

- [#469](https://github.com/saud-alnasser/rentable/pull/469) [`e6f2721`](https://github.com/saud-alnasser/rentable/commit/e6f2721289974040ea9988a1c968b6e955b7b7ed) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - right-clicking a tenant in the directory opens that tenant's own actions — editing it, and
  deleting it behind the same confirmation the tenant's page asks, which still names what blocks
  the deletion. Clicking the card opens the tenant as it always did

- [#445](https://github.com/saud-alnasser/rentable/pull/445) [`02e5f34`](https://github.com/saud-alnasser/rentable/commit/02e5f346f0198896fe6c6989b080ea2c0729bcf4) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - on a record with more than one collection — today only a contract — a collection scrolls inside its
  own panel instead of growing past the bottom of the window and taking the page with it. the
  contract's unit panes and its payments statement are both fixed by it

- [#466](https://github.com/saud-alnasser/rentable/pull/466) [`c587553`](https://github.com/saud-alnasser/rentable/commit/c587553e43e8e8e0eca11a3efbbf424a34f360ac) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - answering or deferring a workspace conflict at startup goes straight to the application: the
  panel and its progress stay on screen until the app appears, where the entry card used to show
  for a moment in between with nothing left to answer

- [#446](https://github.com/saud-alnasser/rentable/pull/446) [`70ed2b4`](https://github.com/saud-alnasser/rentable/commit/70ed2b42fab337e7c534159f560ea03d9bce0ea7) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - a tenant row shows how many contracts the tenant holds in each of the six statuses, drawn with the
  same glyphs the rest of the application reads a status by, instead of one figure for contracts in
  force under a glyph private to that list. a figure at zero reads quiet, so the only red on the
  screen is a tenant who really is in default. the export follows the row and writes a column per
  status, and ordering by contracts still orders by the ones in force

- [#433](https://github.com/saud-alnasser/rentable/pull/433) [`a12c244`](https://github.com/saud-alnasser/rentable/commit/a12c24410565fb036e76e5f13ff299202517a6e0) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - a unit no longer shows its status twice. it was drawn as a glyph under the unit's name and
  again as a field below, from the same value, so the two could never disagree — only the field
  remains

- [#352](https://github.com/saud-alnasser/rentable/pull/352) [`0fe1aa9`](https://github.com/saud-alnasser/rentable/commit/0fe1aa9589e6f93cdb60b7b76450b73999767446) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - opening the contract form no longer reads every tenant in the workspace. it asks the database for the ones matching what you type, bounded to what the picker shows. the picker still opens on tenants rather than on an instruction to search for one, and an edited contract still shows whose it is.

- [#389](https://github.com/saud-alnasser/rentable/pull/389) [`dbd17b1`](https://github.com/saud-alnasser/rentable/commit/dbd17b1fe74193fa2321654dd93e3451a889fbc3) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - duplicate is offered on a contract and on a payment, where the copy keeps the record's substance — a tenant and a complex no longer offer it, since every field that made them was unique and the copy arrived empty. copying a record's details is unchanged everywhere

- [#482](https://github.com/saud-alnasser/rentable/pull/482) [`ca12c50`](https://github.com/saud-alnasser/rentable/commit/ca12c50daac0e33afc21c7d994907e0dd01ae974) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - a complex card, a unit card and a payment card each offer their actions from the control on the
  card and from a right-click on it, whichever list they are in. What each one offers is unchanged;
  a payment in a terminated contract's statement still offers nothing and now carries no control
  either, leaving the gesture alone rather than answering it with an empty menu

- [#468](https://github.com/saud-alnasser/rentable/pull/468) [`7366e9b`](https://github.com/saud-alnasser/rentable/commit/7366e9b86fcfaba23184bd470de020912758c6fe) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - every scrolling surface now scrolls with the application's own scrollbar, including the command
  centre's results, which used to show the platform's

- [#282](https://github.com/saud-alnasser/rentable/pull/282) [`81c6a41`](https://github.com/saud-alnasser/rentable/commit/81c6a41796f24cd1ca342def14a1ca2ae9af2923) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - if you have asked your system for reduced motion, the application now listens. dialogs, menus, tooltips, sheets, drawers and popovers appear and disappear where they are instead of sliding, fading and scaling into place, and nothing else about them changes — every one is still reachable and still closes the same way. loading spinners keep turning, because a frozen one looks like an application that has stopped rather than a calmer one. if you have not asked for reduced motion, nothing is different.

- [#448](https://github.com/saud-alnasser/rentable/pull/448) [`b4b0c8e`](https://github.com/saud-alnasser/rentable/commit/b4b0c8e8d742b3770870691bf29321777ec999b1) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - the delete confirmation no longer tells you the action cannot be undone, which was untrue on every
  surface it appeared on: every delete registers its inverse and undo replays it. it now says what is
  actually true — you can undo this while the app is open

- [#292](https://github.com/saud-alnasser/rentable/pull/292) [`9026a87`](https://github.com/saud-alnasser/rentable/commit/9026a87c94f262110f3842b441061165ee39ea91) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - three states in the date pickers now read the way they were written. picking an end date inside the green window shows the chosen day in white on solid green rather than in green on a faint wash, the suggested date fills solid green once you pick it, and hovering a day you have already selected keeps its text bright instead of dimming it. everything else on every surface renders exactly as before.

- [#317](https://github.com/saud-alnasser/rentable/pull/317) [`e0641c5`](https://github.com/saud-alnasser/rentable/commit/e0641c5805204330156357a052950dd2247337e0) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - keep the window's inset framing at every supported size, and stop the navigation drawer
  reopening itself after the window is resized

- [#313](https://github.com/saud-alnasser/rentable/pull/313) [`99104aa`](https://github.com/saud-alnasser/rentable/commit/99104aada8cc63353251d793107913e3f38bd19c) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - ctrl+b now collapses and expands the sidebar whatever keyboard layout you are typing in. it used to match the letter the key produces, so with an arabic layout selected the b key reported ب, the shortcut never fired, and the sidebar could only be toggled from the button in the header. it now matches where the key sits as well as the letter it types, so it works in both languages — and on latin layouts that put b somewhere other than where qwerty does.

- [#470](https://github.com/saud-alnasser/rentable/pull/470) [`4f1bc7a`](https://github.com/saud-alnasser/rentable/commit/4f1bc7a8e62b945da2cdbf7a046c55844f7b8621) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - right-clicking a complex in the directory opens that complex's own actions — editing it, and
  deleting it behind the same confirmation its page asks, which still names the units standing in
  the way

- [#453](https://github.com/saud-alnasser/rentable/pull/453) [`6bb5197`](https://github.com/saud-alnasser/rentable/commit/6bb5197948c8486ffce18965a469e6944b77252f) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - exporting the complexes list writes the occupied-units column its rows show. the file carried total
  and vacant only, so a reader exported what they were looking at and got something missing a figure
  that was on screen

- [#471](https://github.com/saud-alnasser/rentable/pull/471) [`5fabd71`](https://github.com/saud-alnasser/rentable/commit/5fabd71fd11c8f514eeefbf2463f46163667317c) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - right-clicking a contract in the directory opens that contract's own actions — duplicating it,
  editing it, terminating or restoring it where its status allows, and deleting it — each behind the
  same confirmation its page asks

- [#483](https://github.com/saud-alnasser/rentable/pull/483) [`5a8eed2`](https://github.com/saud-alnasser/rentable/commit/5a8eed24286f1f2f227e505d82fda0a97ed18f19) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - a contract card reads the same everywhere it is listed. On a unit's page and a tenant's it takes
  the card's own corner on its focus ring rather than a square one, and on all three surfaces the
  figures on the row — the payment count, the status, the fulfillment — keep their own hover names
  and are no longer part of what opens the contract; the card around them still is

- [#449](https://github.com/saud-alnasser/rentable/pull/449) [`00b235b`](https://github.com/saud-alnasser/rentable/commit/00b235b4709ff7d5ceada29c762b0a14e76e50f3) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - the dashboard's entry in the navigation rail has a glyph of its own instead of wearing the same one
  the rail uses as the application's mark, so no picture appears twice in the rail meaning two
  different things

- [#439](https://github.com/saud-alnasser/rentable/pull/439) [`ddbfb9e`](https://github.com/saud-alnasser/rentable/commit/ddbfb9e06ad5391d109327d17bd01b648253f701) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - a list's export control is drawn as a table with an arrow leaving it, rather than as a download
  arrow. nothing is downloaded here — the file is written to disk and revealed in the file manager

- [#454](https://github.com/saud-alnasser/rentable/pull/454) [`47f7976`](https://github.com/saud-alnasser/rentable/commit/47f7976e4fec5e63bdf0d4485742fe88175e6e92) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - the two greens in the interface come from named colours declared with the rest of the palette — one
  for a callout reporting success, one for a date the contract's end-date window permits or suggests —
  instead of being raw palette values that said nothing about what they meant

- [#389](https://github.com/saud-alnasser/rentable/pull/389) [`dbd17b1`](https://github.com/saud-alnasser/rentable/commit/dbd17b1fe74193fa2321654dd93e3451a889fbc3) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - the landing screen shows the first few contracts of each rank rather than every one of them, and each heading still states how many the rank holds in full. its search box is gone — finding a contract is the contracts list's job, and that list searches and now filters by rank. the screen costs the same to open whether the portfolio needs four contracts chasing or four hundred.

- [#456](https://github.com/saud-alnasser/rentable/pull/456) [`ca6b268`](https://github.com/saud-alnasser/rentable/commit/ca6b26865849d890c62d1e294b4af1a0298c8ec2) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - the payment count on a contract row reads as money rather than wearing the same tone as the status
  glyph beside it, so a figure counting money and a glyph reporting a condition no longer say different
  things in the same colour

- [#451](https://github.com/saud-alnasser/rentable/pull/451) [`1cc36ea`](https://github.com/saud-alnasser/rentable/commit/1cc36ea7e0a165053e769ee32454eac1a79db97a) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - the payment form's "remaining after" figure no longer counts the payment twice. editing one without
  changing its amount leaves the figure where it is instead of appearing to pay the contract down
  again, lowering one lifts the figure back up even on a contract that was paid in full, and recording
  one no longer overshoots for the moment between the save landing and the form closing

- [#458](https://github.com/saud-alnasser/rentable/pull/458) [`732c974`](https://github.com/saud-alnasser/rentable/commit/732c974a23a4c7a77792aa253f094d05f2082ef1) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - the settings page says what each setting does for you rather than how the app does it — no
  migrations, no unlink cleanup, no github releases or signed builds — and stops saying things twice:
  the page no longer lists the four groups whose names sit directly beneath it, and three sections no
  longer carry a row title repeating their own heading

- [#467](https://github.com/saud-alnasser/rentable/pull/467) [`c0b70d6`](https://github.com/saud-alnasser/rentable/commit/c0b70d60696be70f0c10f71dc2a437c30135d741) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - the startup screen's controls report their own work: choosing to open the local workspace no
  longer makes the link control announce that it is linking, and the control that was pressed is
  the one that says what it is doing

- [#369](https://github.com/saud-alnasser/rentable/pull/369) [`83fad06`](https://github.com/saud-alnasser/rentable/commit/83fad06202d53c9343effea07e21aeeb9b1b66fb) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - the startup conflict question and the workspace section say less: the question and its answers lead, and the detail behind them sits one hover or one screen-reader stop away

- [#447](https://github.com/saud-alnasser/rentable/pull/447) [`793180f`](https://github.com/saud-alnasser/rentable/commit/793180fb7eb28c605cb5aa5145742a15b26f886a) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - the confirmation shown before unlinking a workspace sits on the same surface as every other
  confirmation in the application — same background, corner and shadow — instead of on one of its own

- [#389](https://github.com/saud-alnasser/rentable/pull/389) [`dbd17b1`](https://github.com/saud-alnasser/rentable/commit/dbd17b1fe74193fa2321654dd93e3451a889fbc3) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - take a change back from the message that announces it, rather than from a pair of buttons standing in the titlebar — and ctrl+z now reaches undo on every screen, including the ones that never carried the buttons

## 0.11.1

### Patch Changes

- [#241](https://github.com/saud-alnasser/rentable/pull/241) [`c367dc2`](https://github.com/saud-alnasser/rentable/commit/c367dc2a87978df35a60006494dd5a76cec0a864) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - a national identity number is now accepted only when the whole value is one, so a padded or embedded number such as `!1234567890!` is refused where it was previously saved. surrounding whitespace is removed before the check, so an existing tenant stored with padding can still be opened and saved.

## 0.11.0

### Minor Changes

- [#169](https://github.com/saud-alnasser/rentable/pull/169) [`ca16df4`](https://github.com/saud-alnasser/rentable/commit/ca16df428631966acf37e294dd30e36b951f6c8e) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - rentable now keeps a diagnostics log on this machine, covering startup, migrations, backups, and sync. settings shows where the files are and opens the folder, so a failure can be sent on rather than described from memory. the log is bounded in size, and passwords and account tokens are stripped out before anything is written.

### Patch Changes

- [#174](https://github.com/saud-alnasser/rentable/pull/174) [`67a1c12`](https://github.com/saud-alnasser/rentable/commit/67a1c126ac671ff77947c6d33b486af04e6f6b28) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - the settings screen no longer replaces itself with a load error when a background refresh fails after it has already loaded. an update being downloaded, or a google drive sign-in waiting in the browser, is no longer discarded by that switch.

- [#185](https://github.com/saud-alnasser/rentable/pull/185) [`e218213`](https://github.com/saud-alnasser/rentable/commit/e218213cffa88fe586d342f4c6e485199b2a2a31) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - a sync conflict you set aside now stays set aside wherever you go next. dismissing one at startup and then opening settings used to raise the same question again; it no longer does, until the thing the conflict was about has actually changed.

- [#165](https://github.com/saud-alnasser/rentable/pull/165) [`7a973e1`](https://github.com/saud-alnasser/rentable/commit/7a973e1192eb83e8ac0931b258e312ce9aa0ae24) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - a google drive sign-in that fails because the machine is offline now says so, instead of reading as an unexpected error.

- [#162](https://github.com/saud-alnasser/rentable/pull/162) [`b7a98e8`](https://github.com/saud-alnasser/rentable/commit/b7a98e89138a338fdda1d61ff49d301a66b0d3fb) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - google drive and startup failures now read in the selected language, with the underlying detail kept alongside the message rather than replacing it.

- [#178](https://github.com/saud-alnasser/rentable/pull/178) [`26cb694`](https://github.com/saud-alnasser/rentable/commit/26cb694dd9f43fda66e8e95463d1cf094acb089e) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - renaming a unit to a name another unit in the same complex already holds is now refused for every name the form accepts, an empty one included — previously a blank name skipped the check entirely and two units could end up sharing it.

## 0.10.1

### Patch Changes

- [#80](https://github.com/saud-alnasser/rentable/pull/80) [`a0405ce`](https://github.com/saud-alnasser/rentable/commit/a0405ce2dd81f0ed1a0ee9e3337cec1fd08bb320) Thanks [@renovate](https://github.com/apps/renovate)! - upgrade all non-major dependencies

## 0.10.0

### Minor Changes

- [#83](https://github.com/saud-alnasser/rentable/pull/83) [`a3dfdd4`](https://github.com/saud-alnasser/rentable/commit/a3dfdd49fd10b77f598cc88f054f16defe30c402) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - implement google-drive based remote sync utilizing the backups backend api.

## 0.9.1

### Patch Changes

- [#38](https://github.com/saud-alnasser/rentable/pull/38) [`fc2c9d3`](https://github.com/saud-alnasser/rentable/commit/fc2c9d34f8972f1877cb187890593d2b45655121) Thanks [@renovate](https://github.com/apps/renovate)! - update non-major dependencies

## 0.9.0

### Minor Changes

- [#77](https://github.com/saud-alnasser/rentable/pull/77) [`a3be7ee`](https://github.com/saud-alnasser/rentable/commit/a3be7ee0184df1afd79baeaff56ec8a4eebd68c8) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - redesign ui with integrated navigation and tabbed detail views

## 0.8.1

### Patch Changes

- [#75](https://github.com/saud-alnasser/rentable/pull/75) [`2bfb84c`](https://github.com/saud-alnasser/rentable/commit/2bfb84ceb2d220b1521a9238bd5841ebe1ef509b) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - fixed all linting issues

## 0.8.0

### Minor Changes

- [#73](https://github.com/saud-alnasser/rentable/pull/73) [`ebd6cdf`](https://github.com/saud-alnasser/rentable/commit/ebd6cdf1432f5dadbe975a74e6a2e16ad12d0f78) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - application UI overhaul

  ## Dashboard
  - Extracted dashboard logic into dedicated components (`dashboard-header`, `dashboard-summary-grid`, `dashboard-summary-card`, `dashboard-follow-ups-section`, `dashboard-follow-up-card`, `dashboard-ending-soon-section`, `dashboard-ending-soon-card`)

  ## Layout
  - Extracted layout logic into dedicated components (`layout-frame`, `layout-startup-loading`, `layout-startup-error`, `layout-startup-recovery`)

  ## Settings
  - Extracted settings logic into dedicated card components (`settings-about-card`, `settings-database-card`, `settings-locale-card`, `settings-updates-card`, `settings-ending-soon-card`)

  ## Detail Pages
  - Added dedicated detail pages and routes for complexes (`complexes/[id]`), contracts (`contracts/[id]`), and tenants (`tenants/[id]`)
  - Added `complex-details`, `contract-details`, and `tenant-details` components

  ## Resource Components
  - Overhauled `complexes-data-view`, `contracts-data-view`, and `tenants-data-view`
  - Enhanced `contract-form` and `tenant-form` with expanded fields and improved UX
  - Updated `contract-payments-data-view`, `contract-payments-table`, and `contract-units-management`

  ## Internals
  - Added `locale.ts` utility for locale handling
  - Enhanced `contract-status.ts` with richer status resolution logic
  - Expanded i18n translation keys for `en` and `ar` locales
  - Updated queries for contracts, complexes, and tenants to support detail views
  - Minor consistency fixes across UI fragment components (`card`, `sheet`, `popover`, `tooltip`, `dropdown-menu`, etc.)

## 0.7.0

### Minor Changes

- [#70](https://github.com/saud-alnasser/rentable/pull/70) [`c625922`](https://github.com/saud-alnasser/rentable/commit/c625922249b7964098f3dc7b6988d3bb2f7ebe46) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - optimized data-view with virtualization

- [#71](https://github.com/saud-alnasser/rentable/pull/71) [`b5efb94`](https://github.com/saud-alnasser/rentable/commit/b5efb948c780304c0133ef3a76ea1829fc743513) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - redesigned the application's visual interface with a modern, glass-morphism inspired design system

## 0.6.0

### Minor Changes

- [#68](https://github.com/saud-alnasser/rentable/pull/68) [`bc4f39d`](https://github.com/saud-alnasser/rentable/commit/bc4f39dcd34bcb099647d121dc3593bc6b4acc8d) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - overhauled data-view ui

- [#67](https://github.com/saud-alnasser/rentable/pull/67) [`4a9373d`](https://github.com/saud-alnasser/rentable/commit/4a9373de14eae24ba1681aa49e3a01f8ed74259d) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - overhauled tauri backend

## 0.5.1

### Patch Changes

- [#62](https://github.com/saud-alnasser/rentable/pull/62) [`d44b263`](https://github.com/saud-alnasser/rentable/commit/d44b263c654a86fa9723316fd3b5eb6e7738a421) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - renamed pre-update backup db filename to include better postfix

- [#63](https://github.com/saud-alnasser/rentable/pull/63) [`e4dcc73`](https://github.com/saud-alnasser/rentable/commit/e4dcc73ddd6c1431a93e0f4e4f19280573dc779f) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - make list keys unique in dashboard page lists

## 0.5.0

### Minor Changes

- [#61](https://github.com/saud-alnasser/rentable/pull/61) [`aa50c24`](https://github.com/saud-alnasser/rentable/commit/aa50c24ea96b0124b599d64d7f10fbe25fba1f77) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - add localzation with both en/ar locales

### Patch Changes

- [#54](https://github.com/saud-alnasser/rentable/pull/54) [`ffbeb85`](https://github.com/saud-alnasser/rentable/commit/ffbeb85b2ecd43e66293e05c9200a75d2d1c965e) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - added checking status in update settings

## 0.4.1

### Patch Changes

- [#49](https://github.com/saud-alnasser/rentable/pull/49) [`abf57ab`](https://github.com/saud-alnasser/rentable/commit/abf57ab20f07dfefe9c0413edd256232c82a3c70) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - fixed ending soon window settings to make changes

## 0.4.0

### Minor Changes

- [#35](https://github.com/saud-alnasser/rentable/pull/35) [`ddedd8e`](https://github.com/saud-alnasser/rentable/commit/ddedd8e717c8969a824e39398a86f99db9b2ae8b) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - create crud operations for complexes and units

- [#47](https://github.com/saud-alnasser/rentable/pull/47) [`b2175d7`](https://github.com/saud-alnasser/rentable/commit/b2175d700e7dfe55a962dc4c3016913fb0ae0036) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - implemented app wide settings

- [#42](https://github.com/saud-alnasser/rentable/pull/42) [`4b9cc40`](https://github.com/saud-alnasser/rentable/commit/4b9cc4018ed974587c44a1228ed4ff79b91a0586) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - implement custom shell styles with custom window controls

- [#48](https://github.com/saud-alnasser/rentable/pull/48) [`ed561e0`](https://github.com/saud-alnasser/rentable/commit/ed561e0364ae41843986e5d205800479f03f056f) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - implemented github release based update with manual binary rollback and automatic db rollback

- [#45](https://github.com/saud-alnasser/rentable/pull/45) [`24b6562`](https://github.com/saud-alnasser/rentable/commit/24b65628972a29ccf9376dd6b611e22b59ef3d01) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - use fixed 30-days payments cycle for contracts

- [#40](https://github.com/saud-alnasser/rentable/pull/40) [`70351ad`](https://github.com/saud-alnasser/rentable/commit/70351adfdd0267e150656bd940c8ac2f0f81146b) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - changed navbar from sidebar to floating tools bar with icons only

- [#39](https://github.com/saud-alnasser/rentable/pull/39) [`2fab7e7`](https://github.com/saud-alnasser/rentable/commit/2fab7e71461a1e5c8f19270d1ef1bf19d6f52b5a) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - added crud operations for contracts and payments

- [#41](https://github.com/saud-alnasser/rentable/pull/41) [`b0853ac`](https://github.com/saud-alnasser/rentable/commit/b0853ac8a612eb44f51b81c1fbba2cbaa101acde) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - sync state of the app on startup/mutations

- [#39](https://github.com/saud-alnasser/rentable/pull/39) [`2fab7e7`](https://github.com/saud-alnasser/rentable/commit/2fab7e71461a1e5c8f19270d1ef1bf19d6f52b5a) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - added dashboard for all stats

- [#46](https://github.com/saud-alnasser/rentable/pull/46) [`0276b61`](https://github.com/saud-alnasser/rentable/commit/0276b61ab96f4f5b5a362829caab8ceda563b7c7) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - treat contracts as ending soon when thir end date within the last 60 days of the contract

### Patch Changes

- [#43](https://github.com/saud-alnasser/rentable/pull/43) [`e66ac9a`](https://github.com/saud-alnasser/rentable/commit/e66ac9a1246c88392e0b8f5347d9649822f68023) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - removed transparent background of app shell

- [#44](https://github.com/saud-alnasser/rentable/pull/44) [`45fff62`](https://github.com/saud-alnasser/rentable/commit/45fff621f01f9a298e8a381f2603fc702e3b8ef7) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - ensured db migrations works in prod

- [#36](https://github.com/saud-alnasser/rentable/pull/36) [`fd4233c`](https://github.com/saud-alnasser/rentable/commit/fd4233cffdd42b0b900365fb29203f41a07cafc6) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - removed select option for tenants table

## 0.3.0

### Minor Changes

- [#31](https://github.com/saud-alnasser/rentable/pull/31) [`6de3bca`](https://github.com/saud-alnasser/rentable/commit/6de3bcaecd4cd90ddaa8d7318b9870d4dfe588a7) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - allow users to view, create, update and delete tenants

- [#31](https://github.com/saud-alnasser/rentable/pull/31) [`6de3bca`](https://github.com/saud-alnasser/rentable/commit/6de3bcaecd4cd90ddaa8d7318b9870d4dfe588a7) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - add custom scrollbar aligned with the content area

## 0.2.0

### Minor Changes

- [#2](https://github.com/saud-alnasser/rentable/pull/2) [`617ed34`](https://github.com/saud-alnasser/rentable/commit/617ed343fd17cc3a75ca535f497ffdf2a4cb56f5) Thanks [@saud-alnasser](https://github.com/saud-alnasser)! - added models and database schema for the app
