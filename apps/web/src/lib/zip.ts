const crcTable = new Uint32Array(256)
for (let index = 0; index < 256; index += 1) {
  let crc = index
  for (let bit = 0; bit < 8; bit += 1) crc = (crc & 1) === 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1
  crcTable[index] = crc >>> 0
}

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff
  for (const byte of bytes) crc = (crc >>> 8) ^ (crcTable[(crc ^ byte) & 0xff] ?? 0)
  return (crc ^ 0xffffffff) >>> 0
}

function concat(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, part) => sum + part.length, 0)
  const out = new Uint8Array(total)
  let offset = 0
  for (const part of parts) {
    out.set(part, offset)
    offset += part.length
  }
  return out
}

function uniqueName(name: string, used: Set<string>): string {
  const clean = name.replace(/[\\/]/g, '').replace(/^\.+/, '') || 'file.txt'
  if (!used.has(clean)) {
    used.add(clean)
    return clean
  }
  const dot = clean.lastIndexOf('.')
  const base = dot > 0 ? clean.slice(0, dot) : clean
  const extension = dot > 0 ? clean.slice(dot) : ''
  let count = 2
  while (used.has(`${base}-${count}${extension}`)) count += 1
  const next = `${base}-${count}${extension}`
  used.add(next)
  return next
}

export function zipStored(files: Array<{ name: string; bytes: Uint8Array }>): Uint8Array {
  const used = new Set<string>()
  const locals: Uint8Array[] = []
  const centrals: Uint8Array[] = []
  let offset = 0
  for (const file of files) {
    const nameBytes = new TextEncoder().encode(uniqueName(file.name, used))
    const checksum = crc32(file.bytes)
    const local = new Uint8Array(30 + nameBytes.length + file.bytes.length)
    const view = new DataView(local.buffer)
    view.setUint32(0, 0x04034b50, true)
    view.setUint16(4, 20, true)
    view.setUint16(6, 0x0800, true)
    view.setUint16(8, 0, true)
    view.setUint32(14, checksum, true)
    view.setUint32(18, file.bytes.length, true)
    view.setUint32(22, file.bytes.length, true)
    view.setUint16(26, nameBytes.length, true)
    local.set(nameBytes, 30)
    local.set(file.bytes, 30 + nameBytes.length)
    locals.push(local)

    const central = new Uint8Array(46 + nameBytes.length)
    const centralView = new DataView(central.buffer)
    centralView.setUint32(0, 0x02014b50, true)
    centralView.setUint16(4, 20, true)
    centralView.setUint16(6, 20, true)
    centralView.setUint16(8, 0x0800, true)
    centralView.setUint32(16, checksum, true)
    centralView.setUint32(20, file.bytes.length, true)
    centralView.setUint32(24, file.bytes.length, true)
    centralView.setUint16(28, nameBytes.length, true)
    centralView.setUint32(42, offset, true)
    central.set(nameBytes, 46)
    centrals.push(central)
    offset += local.length
  }
  const centralStart = offset
  const directory = concat(centrals)
  const end = new Uint8Array(22)
  const endView = new DataView(end.buffer)
  endView.setUint32(0, 0x06054b50, true)
  endView.setUint16(8, files.length, true)
  endView.setUint16(10, files.length, true)
  endView.setUint32(12, directory.length, true)
  endView.setUint32(16, centralStart, true)
  return concat([...locals, directory, end])
}
