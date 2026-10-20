/** Helpers for decoding the 12-field CSV emitted by the ResQnet ESP32 captive portal. */
export type ResQnetPortalReport = {
  type: string
  name: string
  peopleText: string
  emergency: string
  injuryLevel: string
  situation: string
  supplies: string
  details: string
  locationAvailable: boolean
  latitude: number | null
  longitude: number | null
  accuracyM: number | null
}

/** Parse a single CSV record, including quoted commas and escaped double quotes. */
export function parseCsvRecord(input: string): string[] | null {
  const fields: string[] = []
  let field = ''
  let inQuotes = false
  let closedQuote = false

  for (let i = 0; i < input.length; i += 1) {
    const char = input[i]

    if (inQuotes) {
      if (char === '"') {
        if (input[i + 1] === '"') {
          field += '"'
          i += 1
        } else {
          inQuotes = false
          closedQuote = true
        }
      } else {
        field += char
      }
      continue
    }

    if (char === ',') {
      fields.push(field)
      field = ''
      closedQuote = false
      continue
    }

    if (char === '"' && field.length === 0 && !closedQuote) {
      inQuotes = true
      continue
    }

    if (closedQuote && char.trim() !== '') return null
    field += char
  }

  if (inQuotes) return null
  fields.push(field)
  return fields
}

function optionalCoordinate(value: string, minimum: number, maximum: number): number | null | undefined {
  if (value.trim() === '') return null
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed < minimum || parsed > maximum) return undefined
  return parsed
}

/** Validates and maps the exact portal CSV contract (12 fields). */
export function normalizePortalReport(fields: string[]): ResQnetPortalReport | null {
  if (fields.length !== 12) return null

  const hasLatitude = fields[9].trim() !== ''
  const hasLongitude = fields[10].trim() !== ''
  if (hasLatitude !== hasLongitude) return null

  const latitude = optionalCoordinate(fields[9], -90, 90)
  const longitude = optionalCoordinate(fields[10], -180, 180)
  const accuracyM = optionalCoordinate(fields[11], 0, 1_000_000)
  if (latitude === undefined || longitude === undefined || accuracyM === undefined) return null

  const locationAvailable = fields[8].trim().toLowerCase() === 'true'
  const hasCoordinates = latitude !== null && longitude !== null

  return {
    type: fields[0].trim().slice(0, 80),
    name: fields[1].trim().slice(0, 80),
    peopleText: fields[2].trim().slice(0, 20),
    emergency: fields[3].trim().slice(0, 180),
    injuryLevel: fields[4].trim().slice(0, 40),
    situation: fields[5].trim().slice(0, 180),
    supplies: fields[6].trim().slice(0, 180),
    details: fields[7].trim().slice(0, 240),
    locationAvailable: locationAvailable && hasCoordinates,
    latitude: hasCoordinates ? latitude : null,
    longitude: hasCoordinates ? longitude : null,
    accuracyM: hasCoordinates ? accuracyM : null,
  }
}

export function peopleAffectedFromPortal(value: string): number | null | undefined {
  if (value.trim() === '') return null
  const match = value.trim().match(/^(\d+)(\+)?$/)
  if (!match) return undefined
  const count = Number(match[1])
  if (!Number.isSafeInteger(count) || count < 0 || count > 1_000_000) return undefined
  return count
}

export function classifyPortalReport(reportType: string, injuryLevel: string): {
  category: 'RESCUE' | 'MEDICAL' | 'OTHER'
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
} {
  const type = reportType.toLowerCase()
  if (type.includes('medical')) {
    const severity = injuryLevel.toLowerCase()
    return {
      category: 'MEDICAL',
      priority: severity === 'critical' ? 'CRITICAL' : severity === 'serious' ? 'HIGH' : 'MEDIUM',
    }
  }
  if (type.includes('safe')) return { category: 'RESCUE', priority: 'LOW' }
  if (type.includes('sos')) return { category: 'RESCUE', priority: 'CRITICAL' }
  return { category: 'OTHER', priority: 'MEDIUM' }
}
