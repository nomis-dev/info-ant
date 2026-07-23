# info-ant

## 1.1.0

### Minor Changes

- Extract external image URLs from CSS background-image declarations.

  Some sites render header wordmarks as elements with `background-image: url(https://...)` pointing to external URLs instead of inline SVGs. The logo parser now extracts these via the new `css-bg-img` source type, scoped to logo-named containers and homepage links to avoid false positives from hero/section backgrounds.

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
