# Clodable brand

<img src="../assets/lockup.svg" alt="Clodable" height="48">

## Idea

A *clod* is a lump of clay. Clodable means your app is **moldable**: you shape it with Claude, and when you're happy you publish it, the way you fire clay in a kiln. The mark is a clod with a **thumbprint** pressed into it: *made by you*.

The name also winks at Claude and at Lovable. Keep that wink in the name only. Never use either company's logo, colors as a reference, or wording. Before public launch, see "Trademark check" in [DECISIONS.md](../DECISIONS.md).

## Palette: ceramic glazes

| Token | Light | Dark | Use |
|---|---|---|---|
| `clay` | `#B9502B` | `#E5764F` | Primary action (Publish), brand |
| `celadon` | `#2B7354` | `#6CC59E` | Live, success, healthy |
| `cobalt` | `#2D5BA6` | `#8AB0F0` | Information, links, focus |
| `ochre` | `#8F6210` | `#E6B356` | Warnings |
| `oxide` | `#B1281E` | `#F27B70` | Errors, destructive actions |
| `ink` / `ash` | `#1F1A16` / `#6B6158` | `#F3EEE7` / `#A79D92` | Text / secondary text |
| `paper` / `bisque` / `slip` | `#FBF8F3` / `#F4EEE6` / `#E7DED2` | `#15110E` / `#1E1915` / `#352D27` | Background / surfaces / borders |

All text pairs meet WCAG AA. `scripts/design-sheet.mts` renders the full sheet with every token to `docs/design/sheet.png`.

## Type

- **Product UI:** the system font. It feels native inside Claude Desktop and inside any app's preview.
- **Brand moments** (wordmark, docs headings): *Fraunces*, falling back to Iowan Old Style, Palatino or Georgia. It's a soft serif with a handmade warmth.
- Sizes are 11, 12, 13 (the UI base), 15, 18 and 24 px. Weights are 400, 500, 600 and 700. Keep tracking tight on display sizes (−0.4 px).

## Shape and motion

- Radii are 6, 10, 14 and 20 px, plus the pill. Surfaces feel like smooth stones, never sharp.
- Shadows are warm-tinted, low, and soft.
- Motion runs 120–260 ms with ease-out. A gentle spring is allowed once, when a surface enters. Nothing loops except progress, and `prefers-reduced-motion` turns off all non-essential motion.

## Voice

See [PRINCIPLES.md](PRINCIPLES.md). In short: short, warm, specific, and honest about risk. Clay words ("Shaping…") belong only in moments of delight, never in errors or anything about data.
