import { expect, test } from 'vitest'
import { decodePolyline, nearestIndex } from './geo'

test('polyline: esempio di riferimento di Google', () => {
  // https://developers.google.com/maps/documentation/utilities/polylinealgorithm
  expect(decodePolyline('_p~iF~ps|U_ulLnnqC_mqNvxq`@')).toEqual([[-120.2, 38.5], [-120.95, 40.7], [-126.453, 43.252]])
  expect(decodePolyline('')).toEqual([])
})

test('nearestIndex', () => {
  expect(nearestIndex([[10.3, 44.8], [10.31, 44.8], [10.32, 44.8]], 10.309, 44.8001)).toBe(1)
})
