export interface Pixels {
  data: Uint8ClampedArray
  width: number
  height: number
}

export interface Region { x: number; y: number; w: number; h: number }

export interface StegoReport {
  message: string | null
  blocks: number
  edited: Region[]
}

const MAGIC = [0x41, 0x50, 0x53, 0x31]
const BLOCK = 16
const KEY = new TextEncoder().encode('APAAR-Sathi:gtu-2026-01')
const COPIES = 3

const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()

function crc32(bytes: Uint8Array) {
  let c = 0xffffffff
  for (const b of bytes) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function toBits(bytes: number[]) {
  const bits: number[] = []
  for (const b of bytes) for (let i = 7; i >= 0; i--) bits.push((b >> i) & 1)
  return bits
}

function u32(n: number) { return [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255] }

function frame(message: string) {
  const body = new TextEncoder().encode(message)
  return toBits([...MAGIC, (body.length >> 8) & 255, body.length & 255, ...body, ...u32(crc32(body))])
}

function copyOffsets(px: Pixels, bits: number) {
  const total = px.width * px.height
  const step = Math.floor(total / COPIES)
  return Array.from({ length: COPIES }, (_, i) => i * step).filter((o) => o + bits <= total)
}

function blockHash(px: Pixels, bx: number, by: number) {
  let h = 0x811c9dc5
  const mix = (b: number) => { h ^= b; h = Math.imul(h, 16777619) >>> 0 }
  for (const k of KEY) mix(k)
  mix(bx & 255); mix(bx >> 8); mix(by & 255); mix(by >> 8)
  for (let y = 0; y < BLOCK; y++) {
    for (let x = 0; x < BLOCK; x++) {
      const i = ((by * BLOCK + y) * px.width + (bx * BLOCK + x)) * 4
      mix(px.data[i] & 0xfe)
      mix(px.data[i + 1] & 0xfe)
      mix(px.data[i + 2])
    }
  }
  return h >>> 0
}

function blockSlot(px: Pixels, bx: number, by: number, k: number) {
  const x = bx * BLOCK + (k % BLOCK)
  const y = by * BLOCK + Math.floor(k / BLOCK)
  return (y * px.width + x) * 4
}

export function embed(px: Pixels, message: string) {
  const bits = frame(message)
  for (const off of copyOffsets(px, bits.length)) {
    bits.forEach((bit, j) => {
      const i = (off + j) * 4 + 1
      px.data[i] = (px.data[i] & 0xfe) | bit
    })
  }
  const bw = Math.floor(px.width / BLOCK)
  const bh = Math.floor(px.height / BLOCK)
  for (let by = 0; by < bh; by++) {
    for (let bx = 0; bx < bw; bx++) {
      const h = blockHash(px, bx, by)
      for (let k = 0; k < 32; k++) {
        const i = blockSlot(px, bx, by, k)
        px.data[i] = (px.data[i] & 0xfe) | ((h >>> (31 - k)) & 1)
      }
    }
  }
  for (let i = 3; i < px.data.length; i += 4) px.data[i] = 255
}

function readMessageAt(px: Pixels, off: number): string | null {
  const total = px.width * px.height
  const bit = (j: number) => px.data[(off + j) * 4 + 1] & 1
  const byte = (start: number) => { let v = 0; for (let k = 0; k < 8; k++) v = (v << 1) | bit(start + k); return v }
  if (off + 48 > total) return null
  for (let m = 0; m < 4; m++) if (byte(m * 8) !== MAGIC[m]) return null
  const len = (byte(32) << 8) | byte(40)
  if (len === 0 || off + 48 + len * 8 + 32 > total) return null
  const body = new Uint8Array(len)
  for (let b = 0; b < len; b++) body[b] = byte(48 + b * 8)
  const crcStart = 48 + len * 8
  const crc = ((byte(crcStart) << 24) | (byte(crcStart + 8) << 16) | (byte(crcStart + 16) << 8) | byte(crcStart + 24)) >>> 0
  if (crc !== crc32(body)) return null
  return new TextDecoder().decode(body)
}

export function inspect(px: Pixels): StegoReport {
  let message: string | null = null
  const total = px.width * px.height
  const step = Math.floor(total / COPIES)
  for (let c = 0; c < COPIES && !message; c++) message = readMessageAt(px, c * step)

  const bw = Math.floor(px.width / BLOCK)
  const bh = Math.floor(px.height / BLOCK)
  const edited: Region[] = []
  for (let by = 0; by < bh; by++) {
    for (let bx = 0; bx < bw; bx++) {
      const h = blockHash(px, bx, by)
      let stored = 0
      for (let k = 0; k < 32; k++) stored = ((stored << 1) | (px.data[blockSlot(px, bx, by, k)] & 1)) >>> 0
      if (stored !== h) edited.push({ x: bx * BLOCK, y: by * BLOCK, w: BLOCK, h: BLOCK })
    }
  }
  return { message, blocks: bw * bh, edited }
}

export function mergeRegions(regions: Region[], gap = BLOCK): Region[] {
  const out: Region[] = []
  for (const r of regions) {
    const hit = out.find((o) => r.x <= o.x + o.w + gap && r.x + r.w + gap >= o.x && r.y <= o.y + o.h + gap && r.y + r.h + gap >= o.y)
    if (hit) {
      const x = Math.min(hit.x, r.x)
      const y = Math.min(hit.y, r.y)
      hit.w = Math.max(hit.x + hit.w, r.x + r.w) - x
      hit.h = Math.max(hit.y + hit.h, r.y + r.h) - y
      hit.x = x
      hit.y = y
    } else out.push({ ...r })
  }
  return out
}

export async function fingerprint(jws: string) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(jws))
  return [...new Uint8Array(buf)].slice(0, 8).map((b) => b.toString(16).padStart(2, '0')).join('')
}
