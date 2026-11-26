import { Selections, isCoveringExisting, isInsideExisting, isLowerIntersecting, isUpperIntersecting } from '../lib/selections.js'
import test from 'tape'

const testCases = {
  isLowerIntersecting: {
    fn: isLowerIntersecting,
    cases: [
      { newItem: { from: 8, to: 12 }, existing: { from: 1, to: 10 }, expectedRemoveResult: [{ from: 1, to: 7 }] },
      { newItem: { from: 10, to: 15 }, existing: { from: 1, to: 10 }, expectedRemoveResult: [{ from: 1, to: 9 }] }
    ]
  },
  isUpperIntersecting: {
    fn: isUpperIntersecting,
    cases: [
      { newItem: { from: 15, to: 22 }, existing: { from: 20, to: 25 }, expectedRemoveResult: [{ from: 23, to: 25 }] },
      { newItem: { from: 15, to: 20 }, existing: { from: 20, to: 25 }, expectedRemoveResult: [{ from: 21, to: 25 }] }
    ]
  },
  isInsideExisting: {
    fn: isInsideExisting,
    cases: [
      { newItem: { from: 12, to: 15 }, existing: { from: 10, to: 20 }, expectedRemoveResult: [{ from: 10, to: 11 }, { from: 16, to: 20 }] },
      { newItem: { from: 20, to: 20 }, existing: { from: 10, to: 20 }, expectedRemoveResult: [{ from: 10, to: 19 }] },
      { newItem: { from: 15, to: 20 }, existing: { from: 10, to: 20 }, expectedRemoveResult: [{ from: 10, to: 14 }] }
    ]
  },
  isCoveringExisting: {
    fn: isCoveringExisting,
    cases: [
      { newItem: { from: 10, to: 21 }, existing: { from: 10, to: 20 }, expectedRemoveResult: [] },
      { newItem: { from: 9, to: 20 }, existing: { from: 10, to: 20 }, expectedRemoveResult: [] },
      { newItem: { from: 10, to: 20 }, existing: { from: 10, to: 20 }, expectedRemoveResult: [] },
      { newItem: { from: 0, to: 986 }, existing: { from: 15, to: 986 }, expectedRemoveResult: [] }
    ]
  }
}

test('Selections', (t) => {
  for (const [functionName, { fn, cases }] of Object.entries(testCases)) {
    for (const { newItem, existing } of cases) {
      t.test(`should return true for newItem: ${toString(newItem)} and existing: ${toString(existing)} and everything else should be false`, (s) => {
        t.equal(fn(newItem, existing), true)
        for (const otherFn of Object.keys(testCases)) {
          if (otherFn !== functionName) {
            t.equal(testCases[otherFn].fn(newItem, existing), false)
          }
        }
        s.end()
      })
    }
  }

  /** @type {Selections} */
  let selection

  for (const { cases } of Object.values(testCases)) {
    for (const { newItem, existing, expectedRemoveResult } of cases) {
      t.test(`should remove the given item: ${toString(newItem)} from existing selection: ${toString(existing)} and leave: ${toString(expectedRemoveResult)}`, (s) => {
        selection = new Selections()
        selection.insert(existing)
        selection.remove(newItem)
        assertArrayContentsEqual(t, selection._items, expectedRemoveResult)
        s.end()
      })
    }
  }

  for (const { cases } of Object.values(testCases)) {
    for (const { newItem, existing, expectedRemoveResult } of cases) {
      t.test(`should truncate the existing item: ${toString(existing)} to prevent overlapping with the new selection: ${toString(newItem)}`, (s) => {
        selection = new Selections()
        selection.insert(existing)
        selection.insert(newItem)
        const expected = { from: Infinity, to: 0 }
        for (const item of [...expectedRemoveResult, newItem]) {
          expected.from = Math.min(expected.from, item.from)
          expected.to = Math.max(expected.to, item.to)
        }
        assertArrayContentsEqual(t, selection._items, [expected])
        s.end()
      })
    }
  }

  t.test('should insert large selection and truncate or delete existing selections', (s) => {
    selection = new Selections()
    selection.insert({ from: 5, to: 10 })
    selection.insert({ from: 11, to: 19 })
    selection.insert({ from: 20, to: 40 })

    selection.insert({ from: 9, to: 25 })

    assertArrayContentsEqual(t, selection._items, [{ from: 5, to: 40 }])
    s.end()
  })
})

// The offset of a selection counts from its `from`, and the pieces before `from + offset` are downloaded.
// The torrent requests pieces from `from + offset`, so a wrong offset after a remove skips pieces that are not downloaded.
test('Selections.remove keeps the first piece to request', (t) => {
  const cases = [
    {
      name: 'split of a selection',
      existing: { from: 0, to: 100, offset: 50 },
      removed: { from: 10, to: 20 },
      // all pieces of 0-9 are downloaded
      expected: [{ from: 0, to: 9, next: 9 }, { from: 21, to: 100, next: 50 }]
    },
    {
      name: 'trim of the start, the downloaded pieces end in the removed range',
      existing: { from: 10, to: 100, offset: 5 },
      removed: { from: 0, to: 20 },
      expected: [{ from: 21, to: 100, next: 21 }]
    },
    {
      name: 'trim of the start, the downloaded pieces continue after the removed range',
      existing: { from: 10, to: 100, offset: 30 },
      removed: { from: 0, to: 20 },
      expected: [{ from: 21, to: 100, next: 40 }]
    },
    {
      name: 'trim of the end, all pieces that stay are downloaded',
      existing: { from: 0, to: 100, offset: 80 },
      removed: { from: 50, to: 120 },
      expected: [{ from: 0, to: 49, next: 49 }]
    }
  ]

  for (const { name, existing, removed, expected } of cases) {
    const selections = new Selections()
    selections.insert({ ...existing, priority: 0 })
    selections.remove(removed)

    const actual = selections._items
      .map(item => ({ from: item.from, to: item.to, next: item.from + item.offset }))
      .sort((a, b) => a.from - b.from)
    t.deepEqual(actual, expected, name)
  }
  t.end()
})

/**
 * Converts a selection or an array of selections to a human-readable string
 * @param {{from: number, to: number} | Array<{from: number, to: number}>} param
 * @returns {string}
 */
function toString (param) {
  if (!Array.isArray(param)) {
    const { from, to } = param
    return `[${from}-${to}]`
  }
  return `[${param.map(toString).join(', ')}]`
}

/**
 * Asserts that the given arrays of selections have the same from-to pairs, regardless of order
 * @param {import('tape').Test} t
 * @param {Array<Selections>} actual
 * @param {Array<Selections>} expected
 */
function assertArrayContentsEqual (t, actual, expected) {
  t.equal(actual.length, expected.length)
  // assert that both have the same items regardless of order
  for (const item of actual) {
    t.ok(expected.some(e => e.from === item.from && e.to === item.to))
  }
}
