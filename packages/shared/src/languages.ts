export interface LanguageDefinition {
  id: string
  label: string
  extension: string
  formattable: boolean
}

export const LANGUAGES: readonly LanguageDefinition[] = [
  { id: 'javascript', label: 'JavaScript', extension: 'js', formattable: true },
  { id: 'typescript', label: 'TypeScript', extension: 'ts', formattable: true },
  { id: 'python', label: 'Python', extension: 'py', formattable: false },
  { id: 'java', label: 'Java', extension: 'java', formattable: false },
  { id: 'c', label: 'C', extension: 'c', formattable: false },
  { id: 'cpp', label: 'C++', extension: 'cpp', formattable: false },
  { id: 'go', label: 'Go', extension: 'go', formattable: false },
  { id: 'rust', label: 'Rust', extension: 'rs', formattable: false },
  { id: 'html', label: 'HTML', extension: 'html', formattable: true },
  { id: 'css', label: 'CSS', extension: 'css', formattable: true },
  { id: 'json', label: 'JSON', extension: 'json', formattable: true },
  { id: 'markdown', label: 'Markdown', extension: 'md', formattable: false },
  { id: 'sql', label: 'SQL', extension: 'sql', formattable: false },
  { id: 'plaintext', label: 'Plain text', extension: 'txt', formattable: false },
] as const

export const DEFAULT_LANGUAGE_ID = 'javascript'

export function findLanguage(languageId: string): LanguageDefinition | undefined {
  return LANGUAGES.find((language) => language.id === languageId)
}

export function fileNameFor(languageId: string, roomId: string): { fileName: string; extension: string } {
  const language = findLanguage(languageId)
  const extension = language?.extension ?? 'txt'
  const safeRoom = roomId.replace(/[^A-Za-z0-9_-]/g, '') || 'room'
  return {
    extension,
    fileName: `codetogether-${safeRoom}.${extension}`,
  }
}
