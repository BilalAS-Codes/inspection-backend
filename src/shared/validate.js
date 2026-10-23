import { AppError } from './errors.js';

/**
 * Middleware generator that validates request parts using a Zod schema.
 * Formats validation issues into structured fieldErrors.
 *
 * @param {import('zod').ZodSchema} schema - Zod schema to validate against
 * @param {'body' | 'query' | 'params'} [source='body'] - Request property to inspect
 * @returns {import('express').RequestHandler}
 */
export function validate(schema, source = 'body') {
  return (req, res, next) => {
    const dataToValidate = req[source];
    const result = schema.safeParse(dataToValidate);

    if (!result.success) {
      const fieldErrors = {};
      for (const issue of result.error.issues) {
        const path = issue.path.join('.') || 'root';
        fieldErrors[path] = issue.message;
      }

      return next(
        new AppError(
          'VALIDATION_FAILED',
          'Request data validation failed.',
          422,
          { fieldErrors, issues: result.error.issues }
        )
      );
    }

    req[source] = result.data;
    next();
  };
}
