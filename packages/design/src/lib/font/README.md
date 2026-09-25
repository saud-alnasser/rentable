# Readex Pro

The one typeface both locales render in, committed here so nothing is fetched at runtime.
`tokens.css` loads both files with `@font-face`. `OFL.txt` is the licence they ship under.

## Where they came from

`ofl/readexpro/ReadexPro[HEXP,wght].ttf` in `google/fonts` at commit
`8b0a1d0f5983c89bc2b93f1b5fb55f9e252744b5` (font version 1.205). The source has two axes. `HEXP`
is pinned at its default of 0 and `wght` (160 to 700) is kept, so each file is still variable.

## How to rebuild them

With `fonttools` and `brotli` installed (`pip install fonttools brotli`):

```sh
fonttools varLib.instancer "ReadexPro[HEXP,wght].ttf" HEXP=0 -o ReadexPro-wght.ttf
python patch-tnum.py ReadexPro-wght.ttf ReadexPro-wght-tnum.ttf

pyftsubset ReadexPro-wght-tnum.ttf --layout-features='*' --flavor=woff2 \
  --output-file=readex-pro-latin.woff2 \
  --unicodes="U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD"

pyftsubset ReadexPro-wght-tnum.ttf --layout-features='*' --flavor=woff2 \
  --output-file=readex-pro-arabic.woff2 \
  --unicodes="U+0600-06FF,U+0750-077F,U+0870-088E,U+0890-0891,U+0897-08E1,U+08E3-08FF,U+200C-200E,U+2010-2011,U+204F,U+2E41,U+FB50-FDFF,U+FE70-FE74,U+FE76-FEFC"
```

The two ranges are Google Fonts' own `latin` and `arabic` subsets. Each `@font-face` names the same
range as its `unicode-range`, so a change to one here is a change to the other there.
`--layout-features='*'` keeps every OpenType feature, which the Arabic joining forms need.

## The tabular figures are added here

The source has no `tnum` feature and its digits 0-9 are proportional, so `tabular-nums` would have
nothing to act on. `patch-tnum.py` adds a tabular alternate for each of the ten digits, 672 units
wide at every weight (the widest digit at either master), with each outline centred in that
width, and a `tnum` feature that substitutes them. The default digits are untouched. Only the
Latin file carries the digits 0-9, so only it gains the feature; the Arabic file comes out of the
same command with the same tables as before apart from `head`.
