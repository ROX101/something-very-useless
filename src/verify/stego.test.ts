import { describe, expect, it } from 'vitest'
import { embed, inspect, mergeRegions, type Pixels } from './stego'

function image(w: number, h: number): Pixels {
  const data = new Uint8ClampedArray(w * h * 4)
  let s = 7
  for (let i = 0; i < data.length; i++) {
    s = (s * 1103515245 + 12345) & 0x7fffffff
    data[i] = i % 4 === 3 ? 255 : (s >> 8) & 255
  }
  return { data, width: w, height: h }
}

describe('hidden watermark', () => {
  const msg = 'GTU-2026-CSE-0417|3fa2c91d0b7e4a55'

  it('reads back the hidden message from an untouched image', () => {
    const px = image(320, 240)
    embed(px, msg)
    const r = inspect(px)
    expect(r.message).toBe(msg)
    expect(r.edited).toHaveLength(0)
    expect(r.blocks).toBe(20 * 15)
  })

  it('finds exactly the area that was edited', () => {
    const px = image(320, 240)
    embed(px, msg)
    for (let y = 100; y < 120; y++) for (let x = 200; x < 230; x++) {
      const i = (y * 320 + x) * 4
      px.data[i] = 0; px.data[i + 1] = 0; px.data[i + 2] = 0
    }
    const r = inspect(px)
    expect(r.message).toBe(msg)
    expect(r.edited.length).toBeGreaterThan(0)
    const box = mergeRegions(r.edited)[0]
    expect(box.x).toBeLessThanOrEqual(200)
    expect(box.x + box.w).toBeGreaterThanOrEqual(230)
    expect(box.y).toBeLessThanOrEqual(100)
    expect(box.y + box.h).toBeGreaterThanOrEqual(120)
  })

  it('reports no mark on an image that was never watermarked', () => {
    const r = inspect(image(320, 240))
    expect(r.message).toBeNull()
    expect(r.edited.length).toBeGreaterThan(r.blocks * 0.9)
  })
})
