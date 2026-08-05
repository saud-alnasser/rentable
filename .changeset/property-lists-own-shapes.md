---
'rentable': minor
---

the complexes list reads as a directory rather than a grid of cards. a row leads with the name, carries the location beneath it, and shows how many units the complex holds and how many of those stand vacant — so a screen shows the buildings you were scrolling past. the list can be ordered by name, by location, by unit count or by vacant count, and the order is the database's rather than the screen's.

the units inside a complex read as an occupancy board: a tile per unit, laid out across the window and reflowing as it resizes. a let unit is a solid tile naming the tenant living in it; a free one is a dashed tile that says vacant. searching the board reaches the tenant's name as well as the unit's.

both lists arrive at once, so there is no more loading as you scroll, and the unit and vacant counts come from the same query as the rows rather than from a count per building.
