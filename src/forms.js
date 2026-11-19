// Five Blender primitives, four verbs (sweep, lump, card, paint), and every living thing is a recipe over them.
import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { noise, sat, mix } from './noise.js'

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z)
const UP = V(0, 1, 0), a = V(), b = V(), q = new THREE.Quaternion()
const each = (attr, f) => { for (let i = 0; i < attr.count; i++) f(i) }
const MOSS = [.16, .26, .05]

export async function primitives() {
  const P = {}
  ;(await new GLTFLoader().loadAsync('primitives.glb')).scene.traverse(o => o.isMesh && (P[o.name] = o.geometry))
  return P
}

// ---------------------------------------------------------------- the verbs
// paint: vertex colour from a constant or a rule of (position, normal). Carries tint, moss and baked occlusion.
function paint(g, f) {
  const p = g.attributes.position, n = g.attributes.normal, c = new Float32Array(p.count * 3)
  each(p, i => c.set(typeof f == 'function' ? f(a.fromBufferAttribute(p, i), b.fromBufferAttribute(n, i)) : f, i * 3))
  return g.setAttribute('color', new THREE.BufferAttribute(c, 3))
}

// sweep: thread a tube along path(t) with radius(t, angle). Trunks, limbs, roots, logs, legs, stalks.
export function sweep(prim, path, radius, tint, uv = [1, 1]) {
  const g = prim.clone(), P = g.attributes.position, N = g.attributes.normal, U = g.attributes.uv
  each(P, i => {
    const t = P.getY(i), x = P.getX(i), z = P.getZ(i), c = path(t)
    q.setFromUnitVectors(UP, a.copy(path(t + .01)).sub(path(t - .01)).normalize())
    a.set(x, 0, z).applyQuaternion(q)
    N.setXYZ(i, a.x, a.y, a.z)
    c.addScaledVector(a, radius(t, Math.atan2(z, x)))
    P.setXYZ(i, c.x, c.y, c.z)
    U.setXY(i, U.getX(i) * uv[0], U.getY(i) * uv[1])
  })
  return paint(g, tint)
}

// lump: swell a sphere with noise, then slice it with planes. Rocks, caps, bodies, heads.
export function lump(prim, rnd, size, rough, tint, cuts = 4) {
  const g = prim.clone(), P = g.attributes.position, o = rnd() * 99, uv = new Float32Array(P.count * 2)
  const planes = Array.isArray(cuts) ? cuts : Array.from({ length: cuts }, () => [V(rnd() - .5, rnd() - .5, rnd() - .5).normalize(), .55 + rnd() * .35])
  each(P, i => {
    a.fromBufferAttribute(P, i)
    a.multiplyScalar(1 + rough * (noise(a.x * 1.7 + o, a.y * 1.7 + a.z) + noise(a.y * 3.1 + o, a.z * 3.1 - a.x) * .5 - .75))
    for (const [n, h] of planes) a.addScaledVector(n, -Math.max(0, a.dot(n) - h))
    P.setXYZ(i, a.x * size[0], a.y * size[1], a.z * size[2])
    uv.set([a.x + a.y * .6 + o, a.z + a.y * .6 + o * .7], i * 2)
  })
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2))
  g.computeVertexNormals()
  return paint(g, tint)
}

// card: a strip placed by matrix M, drooped and cupped. cell picks a sprig from the atlas.
export function card(prim, M, cell, tint, droop = 0, cup = 0) {
  const g = prim.clone(), P = g.attributes.position, U = g.attributes.uv
  each(P, i => {
    const x = P.getX(i), y = P.getY(i)
    P.setZ(i, -droop * y * y + cup * Math.abs(x))
    U.setXY(i, (x + .5 + cell % 2) / 2, (y + (cell >> 1)) / 2)
  })
  g.computeVertexNormals()
  return paint(g.applyMatrix4(M), tint)
}

const frame = (p, dir, hint, s) => {
  const y = dir.clone().normalize(), x = y.clone().cross(hint)
  if (x.lengthSq() < 1e-4) x.set(1, 0, 0)
  const z = x.normalize().clone().cross(y)
  return new THREE.Matrix4().makeBasis(x.multiplyScalar(s), y.multiplyScalar(s), z.multiplyScalar(s)).setPosition(p)
}

const form = parts => {
  const mats = Object.keys(parts).filter(k => parts[k].length)
  return { geometry: mergeGeometries(mats.map(k => mergeGeometries(parts[k])), true), mats }
}

// ---------------------------------------------------------------- growth
// One recursion grows every woody thing. A species is only numbers:
//   n[level] children, pitch[level] angle off the parent, lift[level] bend against gravity,
//   spread and shape(f) for the crown outline, leafAt the level that carries foliage.
export const species = {
  spruce: { h: 27, girth: .013, taper: .9, crown: .3, n: [34], pitch: [1.8], spread: .2, shape: f => 1.05 - f, lift: [0, .14], wander: .03, lean: .06,
    leafAt: 1, cards: 5, flat: 1, size: 2.1, cells: [1], droop: .25, bark: [.62, .46, .38], leaf: [.8, .8, .5], moss: .9 },
  beech: { h: 22, girth: .017, taper: .7, crown: .34, n: [9, 3, 2], pitch: [.95, .8, .7], spread: .34, shape: f => .65 + .35 * Math.sin(f * 3.1), reach: .62, lift: [0, .3, .2, .1], wander: .12, lean: .15,
    leafAt: 2, cards: 3, size: 2.7, cells: [3, 0, 3], droop: .15, bark: [.72, .72, .66], leaf: [.6, .72, .42], moss: 1 },
  birch: { h: 18, girth: .009, taper: .8, crown: .4, n: [15, 3], pitch: [.75, .9], spread: .2, shape: f => .6 + .4 * Math.sin(f * 3.1), reach: .6, lift: [0, .12, -.5], wander: .1, lean: .25,
    leafAt: 1, cards: 4, size: 1.5, cells: [0, 3], droop: .5, bark: [1.5, 1.46, 1.38], leaf: [.8, .85, .32], moss: .3 },
  snag: { h: 14, girth: .02, taper: .5, crown: .4, n: [7, 2], pitch: [1.1, .8], spread: .2, shape: () => 1, reach: .5, lift: [0, -.1, -.2], wander: .1, lean: .3,
    leafAt: 9, cards: 0, bark: [.8, .78, .74], moss: .7 },
  bush: { h: 2.4, girth: .012, taper: 1, crown: .12, n: [8, 2], pitch: [.8, .7], spread: .5, shape: () => 1, reach: .6, lift: [0, .2, .1], wander: .2, lean: .5,
    leafAt: 1, cards: 3, size: .9, cells: [0, 3], droop: .1, bark: [.5, .42, .36], leaf: [.6, .75, .38], moss: 0 },
  branch: { h: 3.5, girth: .012, taper: .8, crown: .3, n: [4, 2], pitch: [.7, .7], spread: .3, shape: () => 1, reach: .5, lift: [0, 0, 0], wander: .15, lean: 0, leafAt: 9, cards: 0, bark: [.6, .52, .45], moss: .5 },
  log: { h: 6, girth: .045, taper: .2, n: [], lift: [], wander: .04, lean: 0, leafAt: 9, bark: [.55, .45, .38], moss: 3 },
  pine: { h: 30, girth: .012, taper: .6, crown: .58, n: [16, 3], pitch: [1.35, .7], spread: .2, shape: f => .5 + .5 * Math.sin(f * 3.1), reach: .5, lift: [0, .1, .15], wander: .08, lean: .12,
    leafAt: 1, cards: 4, flat: 1, size: 2.2, cells: [1], droop: .1, bark: [.85, .52, .38], leaf: [.75, .85, .5], moss: .3 },
  oak: { h: 17, girth: .028, taper: .6, crown: .25, n: [7, 4, 2], pitch: [1.15, .85, .7], spread: .55, shape: f => .7 + .3 * Math.sin(f * 3.1), reach: .6, lift: [0, .15, .2, .1], wander: .2, lean: .2,
    leafAt: 2, cards: 3, size: 2.6, cells: [3, 3, 0], droop: .1, bark: [.5, .46, .4], leaf: [.5, .62, .3], moss: 1.4 },
  fir: { h: 6, girth: .016, taper: 1, crown: .1, n: [26], pitch: [1.7], spread: .28, shape: f => 1.05 - f, lift: [0, .1], wander: .03, lean: .05,
    leafAt: 1, cards: 4, flat: 1, size: 1.1, cells: [1], droop: .2, bark: [.5, .4, .33], leaf: [.7, .9, .55], moss: 0 },
  bramble: { h: 1.3, girth: .012, taper: 1, crown: .1, n: [9, 3], pitch: [1.2, .8], spread: 1.1, shape: () => 1, reach: .6, lift: [0, -.3, -.2], wander: .3, lean: .6,
    leafAt: 1, cards: 4, size: .7, cells: [0], droop: .3, bark: [.35, .3, .22], leaf: [.45, .6, .3], moss: 0 },
}

export function tree(P, sp, rnd) {
  sp = { ...sp, spread: sp.spread * (.75 + .5 * rnd()), crown: Math.min(.8, sp.crown * (.7 + .6 * rnd())), size: sp.size * (.85 + .3 * rnd()) } // no two alike
  const bark = [], leaf = [], H = sp.h * (.75 + rnd() * .5), R = H * sp.girth, ph = rnd() * 6
  const tint = p => mix(sp.bark, MOSS, sat(sp.moss * (1.2 - p.y / 2.5) * noise(p.x * 3 + ph, p.y * 2 + p.z * 3) * 1.6)).map(c => c * (.5 + .5 * sat(p.y / 1.2)))
  const grow = (base, dir, len, r, lvl) => {
    const bend = V(rnd() - .5, 0, rnd() - .5).multiplyScalar(len * sp.wander).addScaledVector(UP, len * (sp.lift[lvl] || 0))
    const path = t => base.clone().addScaledVector(dir, len * t).addScaledVector(bend, t * t)
    const rad = lvl ? t => r * (1 - .85 * t) + .004
      : (t, ang) => t <= 0 || t >= 1 ? 0 : r * ((1 - t) ** sp.taper + .04 + .9 * Math.exp(-t * H / R / 2.5) * (.6 + .4 * Math.cos(ang * 5 + ph))) // buttressed foot
    bark.push(sweep(lvl ? P.twig : P.tube, path, rad, tint, lvl ? [1, len / 3] : [Math.max(1, Math.round(r * 5)), H / 3]))
    for (let i = 0, n = sp.n[lvl] || 0; i < n; i++) {
      const f = (i + rnd()) / n, t = lvl ? .25 + .75 * f : sp.crown + (1 - sp.crown) * f * .97, az = i * 2.4 + rnd()
      const side = V(Math.cos(az), 0, Math.sin(az))
      side.addScaledVector(dir, -side.dot(dir)).normalize()
      const pitch = sp.pitch[lvl] * (.8 + .4 * rnd())
      const d = dir.clone().multiplyScalar(Math.cos(pitch)).addScaledVector(side, Math.sin(pitch))
      grow(path(t), d, (lvl ? len * sp.reach : H * sp.spread * sp.shape(f)) * (.7 + .6 * rnd()), Math.max(rad(t, 0) * .45, .01), lvl + 1)
    }
    if (lvl >= sp.leafAt) for (let j = 0; j < sp.cards; j++) {
      const t = .25 + .75 * (j + rnd()) / sp.cards, p = path(t), tan = path(t + .05).sub(p).normalize()
      const out = sp.flat ? V().crossVectors(tan, UP).multiplyScalar(j % 2 ? 1 : -1).addScaledVector(tan, .7) // needles lie in flat sprays either side
        : V(rnd() - .5, rnd() - .3, rnd() - .5).addScaledVector(tan, .8)
      const hint = sp.flat ? V(rnd() * .4 - .2, 1, rnd() * .4 - .2) : V(rnd() - .5, rnd() - .5, rnd() - .5)
      leaf.push(card(P.card, frame(p, out, hint, sp.size * (.7 + .6 * rnd())), sp.cells[j % sp.cells.length], sp.leaf.map(c => c * (.8 + .4 * rnd())), sp.droop, .1))
    }
  }
  grow(V(), V((rnd() - .5) * sp.lean, 1, (rnd() - .5) * sp.lean).normalize(), H, R, 0)
  if (!leaf.length) return Object.assign(form({ bark }), { radius: R })
  // foliage reads as a volume: normals swell outward from the stem, and the interior is darker
  const g = mergeGeometries(leaf), Q = g.attributes.position, N = g.attributes.normal, C = g.attributes.color
  let far = 0
  each(Q, i => (far = Math.max(far, Math.hypot(Q.getX(i), Q.getZ(i)))))
  each(Q, i => {
    const x = Q.getX(i), z = Q.getZ(i), r = Math.hypot(x, z), ao = .25 + .75 * (r / far) ** 1.3
    b.fromBufferAttribute(N, i).lerp(a.set(x, r * .7, z).normalize(), .7).normalize()
    N.setXYZ(i, b.x, b.y, b.z)
    C.setXYZ(i, C.getX(i) * ao, C.getY(i) * ao, C.getZ(i) * ao)
  })
  return Object.assign(form({ bark, leaf: [g] }), { radius: R })
}

// ---------------------------------------------------------------- flora
// herb: a rosette of fronds or sprays. Fern, bracken, nettle and ground cover differ only in cell, tint and stance.
export function herb(P, rnd, cell = 2, tint = [.55, .75, .4], lean = .5, size = .9) {
  const leaf = [], n = 5 + rnd() * 6 | 0
  for (let i = 0; i < n; i++) {
    const az = i / n * 6.283 + rnd(), l = lean * (.8 + rnd()), k = .7 + rnd() * .5
    leaf.push(card(P.blade, frame(V(), V(Math.cos(az) * l, 1, Math.sin(az) * l), UP, size * (.8 + rnd() * .6)), cell, tint.map(c => c * k), .75, .12))
  }
  return form({ leaf })
}

// tuft: blades from one root. Lawn, seeding grass and sedge by height, spread and tip colour.
export function tuft(P, rnd, height = .35, spread = .42, tip = [.14, .2, .04], n = 24) {
  const blade = []
  for (let i = 0; i < n; i++) {
    const g = P.blade.clone(), Q = g.attributes.position, N = g.attributes.normal, h = height * (.6 + rnd() * 1.3), lean = rnd() * .6, r = rnd() * spread, az = rnd() * 6.283, c = tip.map(v => v * (.8 + rnd() * .5))
    each(Q, j => { const y = Q.getY(j); Q.setXYZ(j, Q.getX(j) * .02 * (1.05 - y * y), y * h, -lean * h * y * y); N.setXYZ(j, 0, 1, .35) })
    g.rotateY(az).translate(Math.cos(az * 7) * r, 0, Math.sin(az * 7) * r)
    blade.push(paint(g, p => mix([.015, .035, .008], c, sat(p.y / h))))
  }
  return form({ blade })
}

// flower: a few stalks, each a whorl of petal cards. Colour is the species.
export function flower(P, rnd, hue) {
  const blade = []
  for (let i = 0, n = 2 + rnd() * 5 | 0; i < n; i++) {
    const h = .15 + rnd() * .35, x = rnd() * .5 - .25, z = rnd() * .5 - .25, top = V(x + (rnd() - .5) * .1, h, z)
    blade.push(sweep(P.twig, t => V(x, 0, z).lerp(top, t), () => .004, [.1, .2, .04]))
    for (let j = 0; j < 5; j++) blade.push(card(P.card, frame(top, V(Math.cos(j * 1.26), .4, Math.sin(j * 1.26)), UP, .05 + rnd() * .03), 0, hue.map(c => c * (.8 + .4 * rnd())), .5, .3))
  }
  return form({ blade })
}

// rock: a cut boulder with moss on its shoulders, or with moss = 1 a smooth green cushion.
export const rock = (P, rnd, moss = 0) => {
  const o = rnd() * 9
  return form({ rock: [lump(P.blob, rnd, [1, (moss ? .3 : .4) + rnd() * .7, .6 + rnd() * .6], moss ? .15 : .5,
    (p, n) => mix([1.1, 1.1, 1.08], [.3, .5, .1], Math.max(moss, sat((n.y - .3) * 3) * sat(noise(p.x * 2 + o, p.z * 2) * 2.6 - .8))), moss ? 0 : 2 + rnd() * 5 | 0)] })
}

export function mushroom(P, rnd) {
  const plain = [], cap = [[.5, .08, .04], [.42, .28, .15], [.8, .74, .6], [.55, .36, .06]][rnd() * 4 | 0]
  for (let i = 0, n = 1 + rnd() * 4 | 0; i < n; i++) {
    const h = .07 + rnd() * .1, x = rnd() * .3, z = rnd() * .3, w = h * (.5 + rnd() * .4)
    plain.push(sweep(P.twig, t => V(x, t * h, z), () => h * .12, [.7, .66, .55]))
    plain.push(lump(P.blob, rnd, [w, w * .7, w], .1, cap, [[V(0, -1, 0), .1]]).translate(x, h, z))
  }
  return form({ plain })
}

export const litter = (P, rnd) => form({ leaf: [card(P.card, new THREE.Matrix4().makeRotationX(-1.5).scale(V(.35, .35, .35)).setPosition(0, .03, 0), rnd() * 2 | 0 ? 0 : 3, [1.3 + rnd() * .5, .7, .25], .2, .2)] })

// ---------------------------------------------------------------- fauna
// Two wings and a body, unit span. The wing material flaps it; chord, taper and scale decide butterfly, dragonfly or moth.
export function flyer(P, rnd, chord, tint, taper) {
  const w = P.card.clone(), Q = w.attributes.position, N = w.attributes.normal
  each(Q, i => { const x = Q.getX(i); Q.setXYZ(i, x, 0, (Q.getY(i) - .5) * chord * (1 - Math.abs(x) * taper)); N.setXYZ(i, 0, 1, 0) })
  return form({ wing: [paint(w, p => tint.map(c => c * (.4 + 1.2 * Math.abs(p.x)))), lump(P.blob, rnd, [chord * .18, chord * .18, chord * .75], 0, tint.map(c => c * .6), 0)] })
}
