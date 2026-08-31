export class IgnoreDriftError extends Error {
  constructor(message, { code = "USAGE_ERROR", cause } = {}) {
    super(message, { cause });
    this.name = "IgnoreDriftError";
    this.code = code;
  }
}
