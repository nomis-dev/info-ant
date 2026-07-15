/**
 * info-ant — namespaced root entry.
 *
 * The two toolkits live under their own subpaths and are also re-exported here
 * as namespaces so `import { color, logo } from 'info-ant'` works without the
 * two modules' identically-named exports (assertPublicUrl, parseHttpUrl, …)
 * colliding. For tree-shaking, prefer the subpath imports:
 *
 *   import { extractColors } from 'info-ant/color';
 *   import { extractLogos } from 'info-ant/logo';
 */
export * as color from '../color/lib/index.js';
export * as logo from '../logo/lib/index.js';
