// Seeded randomness. Every rule in the world reads from these, so a seed is a place.
let SEED = 1
export const setSeed = s => (SEED = s | 0)

export const mulberry = s => () => {
  s = s + 0x6D2B79F5 | 0
  let t = Math.imul(s ^ s >>> 15, 1 | s)
  t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t
  return ((t ^ t >>> 14) >>> 0) / 4294967296
}

export const hash = (x, z, k = 0) => {
  let h = Math.imul(x, 374761393) ^ Math.imul(z, 668265263) ^ Math.imul(k + SEED * 7919, 2246822519)
  h = Math.imul(h ^ h >>> 13, 1274126177)
  return ((h ^ h >>> 16) >>> 0) / 4294967296
}

export const noise = (x, z, k = 0) => {
  const ix = Math.floor(x), iz = Math.floor(z)
  let fx = x - ix, fz = z - iz
  fx *= fx * (3 - 2 * fx); fz *= fz * (3 - 2 * fz)
  const a = hash(ix, iz, k), b = hash(ix + 1, iz, k), c = hash(ix, iz + 1, k), d = hash(ix + 1, iz + 1, k)
  return a + (b - a) * fx + (c - a) * fz + (a - b - c + d) * fx * fz
}

export const fbm = (x, z, octaves = 4, k = 0) => {
  let sum = 0, amp = .5, norm = 0
  for (let i = 0; i < octaves; i++, x *= 2.03, z *= 2.03, amp *= .5) sum += amp * noise(x, z, k + i * 13), norm += amp
  return sum / norm
}

export const sat = x => Math.min(1, Math.max(0, x))
export const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t)
