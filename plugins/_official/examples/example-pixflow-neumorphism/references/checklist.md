# Neumorphism Checklist

Before finalizing Stage A, check:

- The first viewport clearly reads as a neumorphic one-material interface.
- Desktop first viewport uses the available canvas; it is not a skinny centered stack with large empty columns.
- After any left rail, there are at least two useful desktop content zones in the first viewport.
- Background and cards share the same surface color; depth comes from shadows.
- Raised components use paired outer shadows with top-left light and bottom-right dark.
- Inset components use inner shadows and are reserved for inputs, active states, tracks, and pressed controls.
- Shadow direction is consistent across the page.
- Teal accent is used sparingly for primary action, active nav, selected state, focus ring, or key chart marks.
- Text contrast is strong enough without relying on shadows.
- Focus-visible states are explicit and high contrast.
- Interactive targets are at least 44px tall on mobile.
- Shadows have enough spacing and do not merge into muddy grey.
- Charts, metrics, tasks, and controls have real labels and product-specific meaning.
- Mobile layout stacks panels in task order and preserves readable shadow separation.
- The page does not become white-card SaaS UI, glassmorphism, hard-shadow skeuomorphism, or a generic dashboard.
- The visible page does not mention external recipe sources, test harnesses, Bricks conversion, or internal file names.
- Stage A output is standalone HTML/CSS and does not include Bricks JSON.

Final critique before handoff:

- Would the recipe be recognizable from a cropped first-viewport screenshot?
- Does the desktop composition feel intentionally full-width and app-like, without abandoned whitespace?
- Are raised and inset states both visible and useful?
- Does every shadowed component carry a real interface role?
- Is the teal accent clear but not overused?
- Does the lower page preserve the same tactile material language?
- Is the artifact strong enough to use as a Pixflow iframe preview without explanation?
