/** Helpers shared by the Datafordeler discovery and BBR join scripts. */

/** Auth or configuration problems: retrying or continuing cannot help. */
export class FatalError extends Error {
  constructor(message) {
    super(message);
    this.name = 'FatalError';
  }
}

/** Keeps API keys out of anything printed or logged. */
export function redact(text) {
  return String(text).replace(/(apikey|token|key)=[^&\s"']+/gi, '$1=[redacted]');
}

export function foldFieldName(name) {
  return name.toLowerCase().replace(/å/g, 'aa').replace(/æ/g, 'ae').replace(/ø/g, 'oe').replace(/[^a-z0-9]/g, '');
}
