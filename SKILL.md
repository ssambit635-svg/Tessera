---
name: design-system-raycast-your-shortcut-to-everything
description: >
  Apply the Raycast - Your shortcut to everything design system when building or updating UI.
  Use when creating components, choosing colors or typography,
  or reviewing designs for marketing interfaces.
---

# Raycast - Your shortcut to everything — Design System Skill

## When to Use

- Building new UI components for Raycast - Your shortcut to everything.
- Reviewing or updating existing component styles.
- Choosing colors, typography, or spacing for marketing pages.
- Checking designs against the extracted token set.

## Context

- **Product:** Raycast - Your shortcut to everything — https://www.raycast.com/
- **Surface:** marketing
- **Audience:** Business decision-makers and potential customers
- **Character:** Conversion-focused marketing presence with a rich, diverse color palette and a complementary two-font typographic system.

## Tokens

### Colors

| Token | Value | Role |
|-------|-------|------|
| --color-bg-400 | `#494B4D` | Background |
| --color-fg-400 | `#5E6366` | Text Primary |
| --color-fg-300 | `#78787C` | Text Secondary |
| --color-red | `#FF6161` | Accent |
| --color-blue | `#57C1FF` | Accent |
| --color-green | `#59D499` | Accent |
| --color-yellow | `#FFC533` | Accent |
| --color-step-2 | `#D3B2FF` | Text Light |
| --color-fg-200 | `#C2C7CA` | Text Light |
| --color-fg | `#F4F4F6` | Text Light |
| color-12 | `#E6E6E6` | Surface |
| color-1 | `#2F3031` | Text Primary |
| color-6 | `#9C9C9D` | Text Secondary |
| color-14 | `#FFFFFF` | Text Light |

### Typography

**Font stack:** Inter, GeistMono

| Level | Size | Usage |
|-------|------|-------|
| text-xs | 12px | Captions, metadata |
| text-sm | 14px | Labels, secondary text |
| text-base | 16px | Body text (default) |
| text-lg | 18px | Subheadings, emphasis |
| text-xl | 64px | Section headings |

**Weight scale:** 400 · 500 · 600
**Line heights:** 70.4px · 19.2px · 16.1px · 16px · 18.4px

### Spacing

**Base unit:** 4px

`space-1: 1px` · `space-2: 4px` · `space-3: 8px` · `space-4: 12px` · `space-5: 16px` · `space-6: 24px` · `space-7: 25px` · `space-8: 32px` · `space-9: 40px` · `space-10: 72px` · `space-11: 76px` · `space-12: 212px` · `space-13: 224px` · `space-14: 370px`

### Shapes

**Border radius:** `radius-sm: 4px` · `radius-md: 6px` · `radius-lg: 8px` · `radius-xl: 16px` · `radius-full: 43px` · `radius-6: 1000px`

### Elevation

- **shadow-sm:** `rgba(0, 0, 0, 0.5) 0px 0px 0px 2px, rgba(255, 255, 255, 0.19) 0px 0px 14px 0px, rgba(0, 0, 0, 0.2) 0px -1px 0.4px 0px inset, rgb(255, 255, 255) 0px 1px 0.4px 0px inset`
- **shadow-md:** `rgba(255, 255, 255, 0.15) 0px 1px 1px 0px inset`
- **shadow-lg:** `rgba(245, 48, 107, 0.1) 0px 0px 20px 0px`

### Motion

- **duration-fast:** `all`
- **duration-fast:** `none`
- **duration-base:** `color 0.2s`
- **duration-base:** `0.2s ease-in-out`
- **duration-base:** `background-image 0.2s, background-color 0.2s, box-shadow 0.2s ease-in-out, transform 0.1s ease-in-out`
- **duration-base:** `transform 0.2s`
- **duration-base:** `0.2s`
- **duration-base:** `height 0.3s, transform 0.3s`
- **duration-slow:** `1s 1s forwards H3BVAa_fade-in-up`
- **duration-slow:** `1s forwards H3BVAa_fade-in-up`

## Component Inventory

- **Buttons:** 27 detected
- **Links:** 134 detected
- **Inputs:** 2 detected
- **Lists:** 1 detected
- **Tables:** 1 detected
- **Forms:** 1 detected
- **Images:** 286 detected

## Constraints

### Always

- Use tokens from the tables above — do not introduce new values.
- Include hover, focus-visible, and disabled states for interactive elements.
- Follow the 4px spacing grid.
- Meet WCAG 2.2 AA contrast minimums.

### Never

- Do not introduce colors outside the extracted palette.
- Do not use arbitrary spacing values — stick to the scale.
- Do not mix border-radius values. Pin to the detected set (4px, 6px, 8px, 16px, 43px, 1000px).
- Do not use full-uppercase text for body or paragraph content.
- Do not nest interactive elements (e.g. buttons inside links).
- Do not ship components without defining hover, focus-visible, and disabled states.

## Tone

Concise, confident, implementation-focused. Avoid filler preambles.

## Authoring Workflow

When creating or documenting a component for this system:

1. State intent — one sentence on purpose.
2. Map tokens — list every token the component uses.
3. Define anatomy — named parts with token assignments.
4. Specify states — default, hover, focus-visible, active, disabled, loading, error, empty.
5. Describe interactions — keyboard, pointer, touch, edge cases.
6. Add a11y criteria — testable pass/fail checks.
7. List anti-patterns — concrete misuse examples.
8. Close with the Definition of Done checklist.

## Output Structure

Component guidelines must contain, in order:

1. Overview (purpose, when to use, when not to use)
2. Tokens and foundations
3. Anatomy, variants, responsive behavior
4. States and interactions
5. Accessibility (ARIA, contrast, focus, screen reader)
6. Content guidelines (copy rules, tone)
7. Anti-patterns with reasoning

## Component Requirements

- Reference only tokens from the tables above.
- Define all states: default, hover, focus-visible, active, disabled, loading, error.
- Handle edge cases: empty, overflow, truncation, max content.
- Include keyboard navigation behavior.
- Document ARIA roles and labels.

## Definition of Done

- Default state renders (smoke test).
- All states visually verified.
- Zero hardcoded visual values — tokens only.
- Keyboard navigation works without pointer.
- No critical a11y violations.
- Tested at min and max breakpoint.
- At least one anti-pattern documented.
- Purpose, usage, and limitations documented.
