# Energetic Responsive Rules

- The desktop layout is designed and reviewed at a 1600px viewport, with content constrained to a 1440px container.
- Two-column layouts on desktop must be monitored for text squishing. If a headline wraps into a narrow column, reduce its size locally, stack the layout, or widen the text track.
- On mobile (below 768px), collapse multi-column card grids into single columns to prevent cards from becoming too narrow.
- Maintain readable monospaced labels on mobile by preventing horizontal overflow. Use standard wrapping or slight text scaling.
- Heavy borders and offset shadows must remain visible on mobile, but reduce shadow offsets slightly (e.g. from `6px` to `4px`) if needed to prevent element overlapping.
- Tap targets must be at least 44px on all screens, keeping the button styling consistent.
- Hero layouts stack vertically on mobile: badge -> headline -> centered mockup -> CTA block.
- Respect reduced motion media queries, disabling scaling transitions on buttons and cards when active.
