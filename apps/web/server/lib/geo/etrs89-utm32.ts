/**
 * The converter lives in `packages/shared` so the browser (house-search address
 * geocoding) and the server share one implementation. Re-exported here so the
 * existing server imports and the converter's own test stay untouched.
 */
export { etrs89Utm32ToWgs84, wgs84ToEtrs89Utm32 } from "../../../../../packages/shared/src/utils/etrs89-utm32.js";
