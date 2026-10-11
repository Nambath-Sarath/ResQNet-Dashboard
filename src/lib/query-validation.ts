import { ValidationError } from '@/lib/auth'

export function parseLimit(value: string | null, fallback = 100, maximum = 200): number {
  if (value == null || value === '') return fallback
  if (!/^\d+$/.test(value)) throw new ValidationError('limit must be a positive integer.')
  const limit = Number(value)
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > maximum) {
    throw new ValidationError(`limit must be between 1 and ${maximum}.`)
  }
  return limit
}

export function finiteNumber(
  value: unknown,
  field: string,
  options: { min?: number; max?: number; integer?: boolean } = {},
): number {
  const number = Number(value)
  if (!Number.isFinite(number)) throw new ValidationError(`${field} must be a finite number.`, field)
  if (options.integer && !Number.isInteger(number)) {
    throw new ValidationError(`${field} must be an integer.`, field)
  }
  if (options.min != null && number < options.min) {
    throw new ValidationError(`${field} must be at least ${options.min}.`, field)
  }
  if (options.max != null && number > options.max) {
    throw new ValidationError(`${field} must be at most ${options.max}.`, field)
  }
  return number
}
