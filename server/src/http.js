export function bad(res, message, status = 400) {
  res.status(status).json({ error: message });
  return undefined;
}

/** Wraps a sync/async handler so thrown errors reach the Express error handler. */
export function wrap(handler) {
  return (req, res, next) => {
    try {
      const result = handler(req, res, next);
      if (result && typeof result.then === 'function') result.catch(next);
    } catch (error) {
      next(error);
    }
  };
}

export function stringField(value, { min = 0, max = 4000, field = 'field', trim = true } = {}) {
  if (typeof value !== 'string') throw new HttpError(400, `${field} is required`);
  const out = trim ? value.trim() : value;
  if (out.length < min) throw new HttpError(400, `${field} must be at least ${min} characters`);
  if (out.length > max) throw new HttpError(400, `${field} must be at most ${max} characters`);
  return out;
}

export function optionalString(value, options = {}) {
  if (value === undefined || value === null) return undefined;
  return stringField(value, options);
}

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export function errorHandler(error, _req, res, _next) {
  const status = error instanceof HttpError ? error.status : 500;
  if (status >= 500) console.error('[halo] request failed:', error);
  res.status(status).json({ error: status >= 500 ? 'Something went wrong' : error.message });
}
