import { describe, expect, it } from 'vitest'
import { zipStored } from './zip'

describe('zipStored', () => {
  it('stores each file name and its bytes', () => {
    const zipped = zipStored([
      { name: 'main.js', bytes: new TextEncoder().encode('hi') },
      { name: 'main.js', bytes: new TextEncoder().encode('second') },
    ])
    const text = new TextDecoder().decode(zipped)
    expect(zipped[0]).toBe(0x50)
    expect(text).toContain('main.js')
    expect(text).toContain('main-2.js')
    expect(text).toContain('hi')
    expect(text).toContain('second')
  })
})
