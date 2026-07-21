# info-ant

## 1.0.2

### Patch Changes

- Reconcile accent color against the favicon palette and harvest CSS variables from all rules.

  Some sites declare design tokens on scoped component classes rather than `:root`. Previously those rules were ignored, causing brand colors to fall back to an unrelated favicon swatch. CSS variables are now harvested from every rule (global selectors win on collision); structural roles stay global-only to avoid framework noise; accent candidates are reconciled against the favicon palette via the new `colorDistance` / `nearestColor` utilities.

## 1.0.1

### Patch Changes

- logo: reject the single best-logo guess when it is a non-URL (inline-SVG data
  URI) that references CSS custom properties (`var(--…)`). Such logos resolve
  their styles against the page's stylesheet, which the extracted data URI no
  longer carries, so they render blank in isolation — `extractLogos().logo` now
  returns `null` for them instead of an unusable value.
