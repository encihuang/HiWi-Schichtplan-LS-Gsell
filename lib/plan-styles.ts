import type { AvailabilityStatus } from './data'

// Farben wie in der bisherigen Excel-Planung
export const AVAILABILITY_STYLES: Record<AvailabilityStatus | 'none', string> = {
  ok: 'bg-[#8cc152]',
  ungern: 'bg-[#f2a24b]',
  nein: 'bg-[#ec5a3f]',
  none: 'bg-white',
}

export const AVAILABILITY_RGB: Record<AvailabilityStatus, [number, number, number]> = {
  ok: [140, 193, 82],
  ungern: [242, 162, 75],
  nein: [236, 90, 63],
}
