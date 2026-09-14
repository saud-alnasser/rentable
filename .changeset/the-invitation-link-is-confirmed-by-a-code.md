---
'@rentable/desktop': minor
---

The invitation link is confirmed by a code that is a key half

Inviting somebody, and resetting their password, now produce two things rather than one: the link,
which is sent, and a six-character code, which is read out on a call or in person. The code is not
a check the client performs. The password that opens the invited vault is sealed under the link's
secret and the code together, so a link that leaks, is forwarded on, or is found in a chat weeks
later opens nothing without a code that was alive when it was typed.

A code lapses ninety seconds after it is made. The issuer sees the seconds it has left beside it
and makes a fresh one whenever they need, from the result panel or from the pending member's row;
only the person who issued the invitation can, because only their own vault holds what a code is
sealed under, and anybody else with the act issues a new link instead. The person opening the link
types the code above the password they choose, and a wrong code, a lapsed code or no code at all
opens nothing and says which.

The connect screen no longer names the invited person before the code is typed. Naming them meant
opening their vault with the link's secret alone, which is exactly what this change takes away.
