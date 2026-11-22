import { describe, expect, it } from 'vitest'
import { fileNameFor, findLanguage } from './languages'

describe('file names', () => {
  it('maps known languages to extensions', () => {
    expect(fileNameFor('typescript', 'abc123_-Wxyz')).toEqual({
      fileName: 'codetogether-abc123_-Wxyz.ts',
      extension: 'ts',
    })
    expect(fileNameFor('python', 'abcdefghijkl').extension).toBe('py')
  })

  it('falls back to txt for an unsupported language and strips unsafe filename characters', () => {
    expect(fileNameFor('cobol', 'bad/name')).toEqual({
      fileName: 'codetogether-badname.txt',
      extension: 'txt',
    })
    expect(fileNameFor('unknown', '///')).toEqual({
      fileName: 'codetogether-room.txt',
      extension: 'txt',
    })
  })

  it('marks only Monaco-supported formatters as formattable', () => {
    expect(findLanguage('javascript')?.formattable).toBe(true)
    expect(findLanguage('plaintext')?.formattable).toBe(false)
    expect(findLanguage('python')?.formattable).toBe(false)
  })
})
