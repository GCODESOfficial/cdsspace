# Content and Mobile Interface Standards

This document is a required build standard for CDS Space pages, dashboards, modals, notifications, generated documents, email templates, API copy, and documentation.

## Punctuation rule

Unicode U+2014 em dash characters are prohibited.

Use the punctuation that best expresses the sentence:

- Use a comma for a natural pause.
- Use a colon before an explanation or list.
- Use parentheses for supporting information.
- Use a full stop when two thoughts should be separate sentences.
- Use a standard hyphen only inside a compound term such as `colour-palette`.

The rule includes literal characters, HTML entities, and escaped Unicode forms. `npm run check:content-style` checks maintained source and documentation. `npm run build` runs the same check automatically and must fail if a prohibited form is introduced.

## Mobile interface baseline

Mobile layouts are intentionally different from desktop layouts. Do not scale a desktop canvas down until it fits.

Every new or changed interface must meet these requirements:

- Design from a 320 CSS pixel viewport upward.
- Keep page content inside the viewport without horizontal page scrolling.
- Use a minimum 44 CSS pixel touch target for primary controls.
- Keep icon-only controls at least 40 CSS pixels square and give them an accessible label.
- Allow button labels to wrap instead of shrinking to unreadable sizes.
- Stack primary actions on narrow screens when a row would become crowded.
- Use phone-width bottom sheets for dialogs, with internal scrolling and a reachable close control.
- Use one-column content grids on phones unless two columns remain readable at 320 CSS pixels.
- Put wide data tables in an isolated horizontal scroller. Never make the page itself scroll sideways.
- Use 16 CSS pixel text in editable fields on phones to prevent automatic browser zoom.
- Respect top and bottom safe-area insets on devices with display cutouts.
- Use dynamic viewport units for full-height mobile surfaces.
- Wrap long URLs, identifiers, headings, and user-generated text.
- Keep floating controls clear of bottom navigation and safe-area insets.

## Corner radius rule

Use the CDS Space corner radius ladder everywhere: `4px`, `8px`, `12px`, `16px`.

- Step down exactly one level for every nested surface. A `16px` outer card contains a `12px` inner card, a `12px` control can contain an `8px` action, and an `8px` action can contain a `4px` detail.
- Keep the inner radius smaller than the outer radius by the surrounding inset. This preserves visually concentric corners and prevents an inner card from crowding or cutting across its parent.
- Use the shared CSS custom properties `--radius-step-1` through `--radius-step-4` instead of introducing one-off values for nested cards and controls.

## Iconography rule

Use professional, context-specific Lucide icons across every CDS Space surface.

- The `Sparkles` icon is prohibited in production UI. Do not use it as a generic marker for headings, AI, premium features, empty states, generation, or status.
- Choose the icon that names the action or object directly. Examples include `ClipboardPenLine` for completing a brief, `Bot` or `Brain` for AI, `ImagePlus` for visual generation, `RefreshCw` for refreshing summaries, and `BadgeCheck` for verified benefits.
- Use one icon meaning consistently across client, admin, team, authentication, marketing, modal, and document surfaces.
- Keep decorative icons secondary to the label. Functional controls must retain a visible label or an accessible name.
- Keep icon sizes consistent within a component family and place them inside the `4px`, `8px`, `12px`, `16px` radius ladder when a container is needed.

## Review checklist

Before merging:

1. Run `npm run check:content-style`.
2. Run `npm run build`.
3. Review public, client, admin, team, authentication, modal, notification, and document surfaces at phone width.
4. Confirm there is no horizontal page overflow.
5. Confirm every action is visible, reachable, and large enough to tap.
6. Confirm dialogs fit the viewport and scroll internally.
7. Confirm headings, cards, grids, tables, uploads, and empty states do not overlap.
8. Confirm no `Sparkles` icon remains and every replacement communicates a specific action or object.
