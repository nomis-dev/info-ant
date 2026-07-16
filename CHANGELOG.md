# info-ant

## 1.0.1

### Patch Changes

- logo: reject the single best-logo guess when it is a non-URL (inline-SVG data
  URI) that references CSS custom properties (`var(--…)`). Such logos resolve
  their styles against the page's stylesheet, which the extracted data URI no
  longer carries, so they render blank in isolation — `extractLogos().logo` now
  returns `null` for them instead of an unusable value.
