"""Give Readex Pro the tabular figures it does not ship with.

Readex Pro 1.205 has no `tnum` feature and its digits 0-9 are proportional, so
`font-variant-numeric: tabular-nums` has nothing to act on. This adds one tabular
alternate per digit, `<name>.tnum`, and a `tnum` GSUB feature substituting them.

- Every alternate advances by one width at every `wght`: the widest digit at any
  master, so no figure is squeezed. No advance variation is recorded for them.
- Each outline is its original digit's, moved so its box is centred in that width.
  The move is worked out at each master and the original's gvar deltas are kept,
  so the weight variation is the original's plus that move.
- The default digits, their metrics and every existing lookup are left alone.

Run on the variable font after `HEXP` is pinned and before subsetting:

    python patch-tnum.py ReadexPro-wght.ttf ReadexPro-wght-tnum.ttf

It expects the two-master `wght` design this release has, and stops if it does not.
"""

import copy
import sys

from fontTools.ttLib import TTFont
from fontTools.ttLib.tables import otTables as ot
from fontTools.ttLib.tables.TupleVariation import TupleVariation

DIGITS = [0x30 + n for n in range(10)]
SUFFIX = ".tnum"


def masters(font, name):
    """The digit's full deltas at each master, keyed by the tuple's peak."""
    glyf = font["glyf"]
    coords, controls = glyf._getCoordinatesAndControls(name, font["hmtx"].metrics)
    ends = controls.endPts
    out = {}
    for variation in font["gvar"].variations[name]:
        if set(variation.axes) != {"wght"}:
            sys.exit(f"{name}: a variation on an axis other than wght")
        peak = variation.axes["wght"][1]
        if peak in out:
            sys.exit(f"{name}: two tuples peak at {peak}")
        full = copy.deepcopy(variation)
        full.calcInferredDeltas(coords, ends)
        out[peak] = (variation.axes, list(full.coordinates))
    if set(out) != {-1.0, 1.0}:
        sys.exit(f"{name}: expected masters at wght -1 and 1, found {sorted(out)}")
    return coords, out


def box(points):
    xs = [x for x, _ in points]
    return min(xs), max(xs)


def advance_at(coords, deltas):
    # the second phantom point is the advance, and the first the origin.
    n = len(coords)
    origin = coords[n - 4][0] + deltas[n - 4][0]
    return coords[n - 3][0] + deltas[n - 3][0] - origin


def patch(source, target):
    font = TTFont(source)
    cmap = font.getBestCmap()
    names = [cmap[code] for code in DIGITS]
    glyf, hmtx, gvar = font["glyf"], font["hmtx"], font["gvar"]

    if "tnum" in {r.FeatureTag for r in font["GSUB"].table.FeatureList.FeatureRecord}:
        sys.exit("the font already has a tnum feature")

    readings = {name: masters(font, name) for name in names}

    # the width: the widest digit advance at the default and at either master.
    width = 0
    for name, (coords, tuples) in readings.items():
        zero = [(0, 0)] * len(coords)
        width = max(width, advance_at(coords, zero))
        for _, deltas in tuples.values():
            width = max(width, advance_at(coords, deltas))

    order = font.getGlyphOrder()
    added = []
    for name in names:
        coords, tuples = readings[name]
        outline = len(coords) - 4

        def shift(points):
            lo, hi = box(points[:outline])
            return round(width / 2 - (lo + hi) / 2)

        base = shift(list(coords))
        alternate = name + SUFFIX

        glyph = copy.deepcopy(glyf[name])
        glyph.coordinates.translate((base, 0))
        glyph.recalcBounds(glyf)
        glyf.glyphs[alternate] = glyph
        hmtx.metrics[alternate] = (width, glyph.xMin)

        variations = []
        for axes, deltas in tuples.values():
            moved = [(x + dx, y + dy) for (x, y), (dx, dy) in zip(coords, deltas)]
            extra = shift(moved) - base
            # gvar stores whole units, and the inferred deltas the originals leave to IUP are not.
            full = [(round(dx + extra), round(dy)) for dx, dy in deltas[:outline]]
            # the origin and the advance stay put; the vertical phantoms are the original's.
            full += [(0, 0), (0, 0)] + [(round(x), round(y)) for x, y in deltas[outline + 2 :]]
            variations.append(TupleVariation(dict(axes), full))
        gvar.variations[alternate] = variations
        added.append(alternate)

    font.setGlyphOrder(order + added)
    glyf.glyphOrder = order + added

    # an advance that does not vary: one row of zero deltas, which every alternate maps to.
    hvar = font["HVAR"].table
    data = hvar.VarStore.VarData[0]
    data.Item.append([0] * data.VarRegionCount)
    data.ItemCount = len(data.Item)
    index = (0 << 16) | (data.ItemCount - 1)
    for alternate in added:
        hvar.AdvWidthMap.mapping[alternate] = index

    if "GDEF" in font and font["GDEF"].table.GlyphClassDef:
        for alternate in added:
            font["GDEF"].table.GlyphClassDef.classDefs[alternate] = 1

    gsub = font["GSUB"].table
    lookup = ot.Lookup()
    lookup.LookupType = 1
    lookup.LookupFlag = 0
    single = ot.SingleSubst()
    single.Format = 2
    single.mapping = {name: name + SUFFIX for name in names}
    lookup.SubTable = [single]
    lookup.SubTableCount = 1
    gsub.LookupList.Lookup.append(lookup)
    gsub.LookupList.LookupCount = len(gsub.LookupList.Lookup)
    lookup_index = gsub.LookupList.LookupCount - 1

    feature = ot.FeatureRecord()
    feature.FeatureTag = "tnum"
    feature.Feature = ot.Feature()
    feature.Feature.LookupListIndex = [lookup_index]
    feature.Feature.LookupCount = 1

    records = gsub.FeatureList.FeatureRecord
    ordered = sorted(range(len(records) + 1), key=lambda i: (records + [feature])[i].FeatureTag)
    remap = {old: new for new, old in enumerate(ordered)}
    gsub.FeatureList.FeatureRecord = [(records + [feature])[i] for i in ordered]
    gsub.FeatureList.FeatureCount = len(gsub.FeatureList.FeatureRecord)
    tnum_index = remap[len(records)]

    for script in gsub.ScriptList.ScriptRecord:
        systems = [script.Script.DefaultLangSys] + [r.LangSys for r in script.Script.LangSysRecord]
        for system in systems:
            if system is None:
                continue
            indices = sorted([remap[i] for i in system.FeatureIndex] + [tnum_index])
            system.FeatureIndex = indices
            system.FeatureCount = len(indices)
            if system.ReqFeatureIndex != 0xFFFF:
                system.ReqFeatureIndex = remap[system.ReqFeatureIndex]

    font.save(target)
    print(f"tnum: {len(added)} digits at a width of {width} units per em")


if __name__ == "__main__":
    if len(sys.argv) != 3:
        sys.exit("usage: patch-tnum.py <source.ttf> <target.ttf>")
    patch(sys.argv[1], sys.argv[2])
