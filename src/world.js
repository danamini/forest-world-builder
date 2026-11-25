// Where things live. Three fields (path, glade, wet) plus height are the whole ecology:
// every layer, plant or animal, is one rule over those fields, scattered on a hashed grid around the walker.
import * as THREE from 'three'
import { hash, noise, fbm, sat, mix } from './noise.js'
import * as F from './forms.js'

export const trail = z => 45 * (noise(z * .011, 3.3, 5) - .5) + 12 * (noise(z * .035, 8.1, 6) - .5)
export const fields = (x, z) => ({
  path: Math.abs(x - trail(z)),                               // metres from the footpath
  glade: Math.max(sat((fbm(x * .007, z * .007, 3, 1) - .55) * 14), sat((noise(x * .028, z * .028, 21) - .74) * 9)), // 1 in a clearing: broad meadows, and small openings where a tree came down
  wet: fbm(x * .008, z * .008, 3, 2),                         // damp hollows: spruce, fern, moss, mist
  gap: sat(noise(x * .045, z * .045, 7) * 4 - 1.3),             // 0 where the canopy opens and sun reaches the floor
})
export const height = (x, z) => 16 * fbm(x * .006, z * .006, 4, 3) + 1.5 * fbm(x * .04, z * .04, 2, 4) - .2 * Math.exp(-(((x - trail(z)) / 3) ** 2)) // every feature is wider than the ground sheet's 2 m grid, so plants sit on it

const many = (n, f) => Array.from({ length: n }, f)
const pick = (r, n, first = 0) => first + (r() * n | 0)
const fly = (R, H, v, flutter = 0) => (d, o, t, dt, wx, wz, solid) => { // wander a looping orbit around home, nose along the path of travel, bobbing as it goes, round any trunk in the way
  const at = k => { const a = (t + k) * v / R * (o.h > .5 ? 1 : -1) + o.h * 99
    d.position.set(o.x + Math.cos(a) * R * (.5 + o.h), o.y + H * (.6 + .4 * o.h) + Math.sin(a * 2.3 + o.h * 9) * H * .1, o.z + Math.sin(a * 1.3) * R); solid?.(d.position, .3, 1); return d.position }
  const next = at(.2).clone()
  at(0); d.lookAt(next)
  d.position.y += Math.sin(t * 8 + o.h * 70) * flutter // the flutter lifts the body without nodding it
}
const wing = (R, H, v) => { const path = fly(R, H, v), head = (d, o, t, s) => { path(d, o, t - .3, 0, 0, 0, s); const x = d.position.x, z = d.position.z; path(d, o, t, 0, 0, 0, s); return Math.atan2(d.position.x - x, d.position.z - z) }
  return (d, o, t, dt, wx, wz, solid) => { const soon = head(d, o, t + .3, solid), now = head(d, o, t, solid) // a bird flies the same loop, and banks into its turns
    d.rotateZ(Math.max(-.9, Math.min(.9, ((now - soon + 9.425) % 6.283 - 3.1416) * 3))) } }
// A beast's whole mind: graze, look up, amble, and bolt when the walker comes close. The young keep to their mother.
// It goes round whatever is solid and whoever is in its way, and after dark it hears the walker from further off: first its eyes, then nothing.
// K = how near before it stares and before it bolts, walking and running speed, how far it strays, how low it grazes, how high it bounds.
const GRAZE = 0, AMBLE = 1, BOLT = 2, STARE = 3, at = { x: 0, z: 0 }
const roam = K => (d, o, t, dt, wx, wz, solid, herd, day) => {
  if (o.px == null) Object.assign(o, { px: o.x, pz: o.z, yaw: o.h * 6.283, aim: o.h * 6.283, v: 0, go: GRAZE, until: t + o.h * 6, neck: K.graze, stride: o.h * 9 })
  const lead = o.lead?.px != null && o.lead, hx = lead ? lead.px : o.x, hz = lead ? lead.pz : o.z, away = Math.hypot(o.px - hx, o.pz - hz), near = Math.hypot(o.px - wx, o.pz - wz)
  const to = (x, z) => Math.atan2(x - o.px, z - o.pz)
  const wary = K.wary * (1.5 - .5 * day), bolt = K.bolt * (1.6 - .6 * day)
  if (near < bolt || (lead && lead.go == BOLT && o.go != BOLT)) { if (o.go != BOLT) o.aim = lead?.go == BOLT ? lead.aim + o.h - .5 : to(wx, wz) + 3.1416 + (o.h - .5); o.go = BOLT; o.until = t + 2.5 + o.h * 2 }
  else if (o.go != BOLT && near < wary) { o.go = STARE; o.until = t + 1.5; o.aim = to(wx, wz) }
  else if (t > o.until) {
    if (away > K.stray || Math.random() < .4) { o.go = AMBLE; o.until = t + 2 + Math.random() * 5; o.aim = away > K.stray * .5 ? to(hx, hz) + Math.random() - .5 : Math.random() * 6.283 }
    else { o.go = Math.random() < .75 ? GRAZE : STARE; o.until = t + 3 + Math.random() * 9; if (o.go == STARE) o.aim = o.yaw + Math.random() - .5 }
  }
  const want = o.go == BOLT ? K.run : o.go == AMBLE ? K.walk * (lead && away > K.stray * 2 ? 3 : 1) : 0
  o.v += (want - o.v) * Math.min(1, dt * 3)
  o.yaw += ((o.aim - o.yaw + 9.425) % 6.283 - 3.1416) * Math.min(1, dt * (o.go == BOLT ? 5 : 2.2)) * (o.go == STARE ? .5 : 1)
  const fx = Math.sin(o.yaw), fz = Math.cos(o.yaw)
  at.x = o.px + fx * o.v * dt; at.z = o.pz + fz * o.v * dt
  for (const q of herd) { const gap = (o.room + q.room) * .8, far = Math.hypot(at.x - q.px, at.z - q.pz), k = (gap - far) / far * Math.min(1, dt * 4)
    if (q != o && far < gap && far > .001) { at.x += (at.x - q.px) * k; at.z += (at.z - q.pz) * k } }
  const ax = at.x, az = at.z
  if (solid(at, o.room) && o.v > .05) { // turn along whatever it met, whichever way is nearer its heading
    const nx = at.x - ax, nz = at.z - az, side = -nz * fx + nx * fz, way = Math.abs(side) > .05 * Math.hypot(nx, nz) ? Math.sign(side) : o.h > .5 ? 1 : -1
    if (nx || nz) o.aim = Math.atan2(-nz * way, nx * way) }
  o.px = at.x; o.pz = at.z
  const run = sat((o.v - K.walk) / (K.run - K.walk)), step = sat(o.v / K.walk), L = o.leg * o.s, lope = K.hop ? step : run
  o.stride += Math.min(o.v * 1.571 / (.42 * L), K.pace) * dt // feet cover the ground they stand on, until the legs can go no faster
  o.neck += ((o.go == GRAZE ? K.graze : o.go == STARE ? -.2 : o.go == BOLT ? -.1 : .2) - o.neck) * Math.min(1, dt * 2.5)
  const slope = Math.atan2(height(o.px + Math.sin(o.yaw) * L, o.pz + Math.cos(o.yaw) * L) - height(o.px - Math.sin(o.yaw) * L, o.pz - Math.cos(o.yaw) * L), 2 * L)
  d.position.set(o.px, height(o.px, o.pz) + lope * K.bound * L * (.5 - .5 * Math.cos(o.stride + 1)), o.pz)
  d.rotation.set(-slope + lope * .14 * Math.sin(o.stride + 1), o.yaw, 0, 'YXZ')
  return [o.stride, step, o.neck, lope]
}

export function populate(scene, P, mats, rnd) {
  const S = F.species, grow = (sp, n = 4) => many(n, () => F.tree(P, sp, rnd))
  const fallen = (sp, n) => grow(sp, n).map(f => (f.geometry.rotateZ(Math.PI / 2).translate(0, f.radius * .7, 0), f))
  const layers = [
    { cell: 5, radius: 175, sink: .3, forms: [S.spruce, S.beech, S.birch, S.snag, S.pine, S.oak].flatMap(sp => grow(sp)), rule: (e, r) => {
      if (e.path < 2.4 || r() > .8 * sat(1 - 1.7 * e.glade) * (.25 + .75 * e.gap)) return
      const k = r(), damp = e.wet + (r() - .5) * .2 > .5
      const kind = k < .04 ? 3 : damp ? (k < .6 ? 0 : k < .8 ? 4 : 2) : k < .45 ? 1 : k < .7 ? 5 : k < .85 ? 2 : 4
      return [pick(r, 4, kind * 4), .7 + r() * .6] }, hard: f => f.radius * 1.4 },
    { cell: 4.3, radius: 115, forms: [S.bush, S.fir, S.bramble].flatMap(sp => grow(sp, 3)), rule: (e, r) => e.path > 4 && r() < .36 - .3 * e.glade && [pick(r, 3, r() < .3 ? 6 : e.wet > .5 ? 3 : 0), .5 + r() * .7], hard: f => f.crown * .3 },
    { cell: 1.4, radius: 58, shadow: false, rule: (e, r) => e.path > 1 && r() < (.14 + .55 * sat(e.wet * 5 - 2.1)) * (1 - .8 * e.glade) && [pick(r, 5, e.wet > .47 ? 0 : 5), .7 + r() * .7],
      forms: [...many(3, () => F.herb(P, rnd)), ...many(2, () => F.herb(P, rnd, 2, [1.1, .75, .3], .6, 1.2)),            // fern, bracken
        ...many(3, () => F.herb(P, rnd, 0, [.4, .6, .3], .35, .5)), ...many(2, () => F.herb(P, rnd, 3, [.5, .7, .35], 1.2, .45))] }, // nettle, ground cover
    { cell: .8, radius: 38, shadow: false, rule: (e, r) => e.path > .7 && r() < .1 + .85 * e.glade && [e.glade > .3 ? pick(r, 5) : pick(r, 4, 3), .7 + r()],
      forms: [...many(3, () => F.tuft(P, rnd)), ...many(2, () => F.tuft(P, rnd, .55, .25, [.4, .36, .14])), ...many(2, () => F.tuft(P, rnd, .5, .15, [.06, .14, .05], 30))] }, // lawn, seeding, sedge
    { cell: 1.1, radius: 30, shadow: false, forms: [[.2, .22, .85], [.85, .85, .8], [.9, .72, .06], [.8, .2, .42], [.42, .18, .72]].map(c => F.flower(P, rnd, c)), // each drift is one species
      rule: (e, r) => e.path > .6 && r() < .7 * sat(noise(e.x * .07, e.z * .07, 11) * 5 - 3) + .2 * e.glade && [r() < .15 ? pick(r, 5) : noise(e.x * .02, e.z * .02, 12) * 15 % 5 | 0, .7 + r() * .8] },
    { cell: 6, radius: 80, sink: .25, tilt: .6, forms: [...many(5, () => F.rock(P, rnd)), ...many(3, () => F.rock(P, rnd, 1))], rule: (e, r) => e.path > 1.5 && r() < .28 && [e.wet > .5 && r() < .5 ? pick(r, 3, 5) : pick(r, 5), .2 + 1.8 * r() ** 3], hard: (f, s) => s > .45 && .8 },
    { cell: 13, radius: 80, tilt: .15, forms: fallen(S.log, 3), rule: (e, r) => e.path > 4 && r() < .35 && [pick(r, 3), .8 + r() * .5], hard: f => f.radius * 1.15, long: 1 },
    { cell: 7, radius: 50, forms: fallen(S.branch, 3), rule: (e, r) => r() < .3 * (1 - e.glade) && [pick(r, 3), .5 + r() * .7] },
    { cell: 2.5, radius: 28, forms: many(4, () => F.mushroom(P, rnd)), rule: (e, r) => r() < .25 * sat(e.wet * 4 - 1.5) && [pick(r, 4), .7 + r()] },
    { cell: 1.1, radius: 24, shadow: false, tilt: .3, forms: many(3, () => F.litter(P, rnd)), rule: (e, r) => r() < .5 * (1 - e.glade) && [pick(r, 3), .5 + r()] },
    { cell: 6, radius: 36, shadow: false, forms: [[.65, .22, .05], [.6, .6, .5], [.14, .28, .7], [.7, .6, .1], [.25, .15, .07]].map(c => F.flyer(P, rnd, .5, c, -1.2)), move: fly(1.8, 1.3, .9, .1), sleeps: 1, // butterflies
      rule: (e, r) => r() < .12 + .6 * e.glade && [pick(r, 5), .06 + r() * .05] },
    { cell: 7, radius: 40, shadow: false, forms: [[.1, .35, .6], [.15, .5, .3], [.6, .15, .1]].map(c => F.flyer(P, rnd, .16, c, .5, [.03, .4, .22], [.22, 55])), move: fly(5, 1.4, 4), sleeps: 1, // dragonflies hawk over damp ground
      rule: (e, r) => r() < sat(e.wet * 5 - 2.1) && [pick(r, 3), .09 + r() * .04] },
    { cell: 5, radius: 30, shadow: false, forms: [[.5, .48, .4], [.3, .26, .2]].map(c => F.flyer(P, rnd, .6, c, .3, [.07, .26, 0], [.7, 26])), move: fly(1.2, 1.8, .7, .15), sleeps: -1, // moths come out when the butterflies go in
      rule: (e, r) => r() < .5 && [pick(r, 2), .04 + r() * .03] },
    { cell: 5, radius: 30, shadow: false, forms: [F.litter(P, rnd)], rule: (e, r) => r() < .5 * (1 - e.glade) && [0, .4 + r() * .4],
      move: (d, o, t) => { const k = (t * .7 + o.h * 40) % 14
        d.position.set(o.x + Math.sin(t + o.h * 9) * .7, o.y + 14 - k, o.z + Math.cos(t * .7 + o.h * 5) * .7)
        d.rotation.set(t * 1.3 + o.h * 6, t * .9, o.h * 6) } },
    // the understorey between herb and tree: saplings racing for a gap, whortleberry on dry ground, the stumps of what fell
    { cell: 3.4, radius: 75, forms: [...grow(S.sapling, 3), ...grow(S.whort, 3), ...grow(S.stump, 2)], rule: (e, r) => {
      const k = r(), edge = e.glade * (1 - e.glade) * 4
      return e.path > 1.6 && (k < .05 ? [pick(r, 2, 6), .6 + r() * .9] : k < .05 + .3 * (1 - e.gap) * (1 - .8 * e.glade) + .3 * edge ? [pick(r, 3), .5 + r() * .8] : k < .5 && e.wet < .5 && e.glade < .3 && [pick(r, 3, 3), .7 + r() * .8]) }, hard: (f, s, i) => i > 5 ? f.radius * 1.3 : i < 3 && .15 },
    { cell: 1.5, radius: 34, shadow: false, rule: (e, r) => e.path > .8 && (r() < .4 * e.glade * sat(noise(e.x * .09, e.z * .09, 15) * 3 - .8) ? [pick(r, 2), .7 + r() * .7] : e.wet > .58 && r() < .3 && [2, .7 + r() * .6]), // meadow grass stands tall in swathes; rushes mark the wettest ground
      forms: [...many(2, () => F.tuft(P, rnd, .85, .3, [.42, .4, .17], 30)), F.tuft(P, rnd, 1, .12, [.1, .2, .06], 22)] },
    { cell: 2.1, radius: 42, shadow: false, forms: [F.spire(P, rnd, [.75, .18, .5]), F.spire(P, rnd, [.7, .12, .55], 1.4), F.spire(P, rnd, [.9, .85, .8]), F.umbel(P, rnd), F.umbel(P, rnd, [.9, .88, .7], 1.3)], // foxglove and willowherb crowd the edges of a clearing, cow parsley the sunny gaps
      rule: (e, r) => e.path > .9 && r() < .45 * e.glade * (1 - e.glade) * 4 + .22 * (1 - e.gap) * sat(noise(e.x * .06, e.z * .06, 16) * 4 - 1.6) && [r() < .5 ? pick(r, 2, 3) : noise(e.x * .03, e.z * .03, 17) * 9 % 3 | 0, .7 + r() * .6] },
    // birds: small ones through the trunks, pigeons and crows over the canopy, a buzzard circling above it all
    { cell: 16, radius: 110, shadow: false, forms: [[.02, .02, .02], [.2, .12, .06], [.16, .18, .2], [.25, .2, .06]].map(c => F.bird(P, rnd, c)), move: wing(18, 9, 4), sleeps: 1, rule: (e, r) => r() < .4 && [pick(r, 4), .22 + r() * .14] },
    { cell: 30, radius: 170, shadow: false, forms: [[.015, .015, .02], [.2, .21, .25]].map(c => F.bird(P, rnd, c, { chord: .24, beat: [-.4, 9] })), move: wing(55, 36, 7), sleeps: 1, rule: (e, r) => r() < .6 && [pick(r, 2), .65 + r() * .25] },
    { cell: 110, radius: 330, shadow: false, forms: [F.bird(P, rnd, [.16, .1, .06], { chord: .26, tail: .16, beat: [-.12, 4], rake: .02 })], move: wing(70, 85, 5), sleeps: 1, rule: (e, r) => r() < .6 && [0, 1.2 + r() * .2] },
    // beasts: a hind with her calves and now and then a stag, rabbits out on the grass, a fox passing through
    { cell: 45, radius: 125, herd: 4, forms: [F.kin.doe, F.kin.stag, F.kin.fawn].map(k => F.beast(P, rnd, k)), move: roam({ wary: 26, bolt: 11, walk: .9, run: 9, stray: 12, graze: 2.1, bound: .5, pace: 15 }),
      rule: (e, r) => e.path > 5 && r() < .08 + .35 * e.glade && [r() < .3 ? 1 : 0, .92 + r() * .16, many(r() * 3.4 | 0, () => r() < .55 ? [2, .9 + r() * .3] : [0, .88 + r() * .14])] },
    { cell: 10, radius: 55, herd: 3, forms: [F.beast(P, rnd, F.kin.rabbit)], move: roam({ wary: 11, bolt: 5.5, walk: 1, run: 7, stray: 5, graze: .5, bound: 1.6, pace: 17, hop: 1 }),
      rule: (e, r) => e.path > 2 && r() < .02 + .12 * e.glade && [0, .85 + r() * .3, many(r() * 2.5 | 0, () => [0, .5 + r() * .5])] },
    { cell: 75, radius: 120, forms: [F.beast(P, rnd, F.kin.fox)], move: roam({ wary: 34, bolt: 15, walk: 1.7, run: 8, stray: 45, graze: .75, bound: .35, pace: 16 }), rule: (e, r) => r() < .45 && [0, .9 + r() * .2] },
  ]

  const d = new THREE.Object3D(), tint = new THREE.Color()
  layers.forEach((L, li) => {
    const cap = Math.ceil(3.3 * (L.radius / L.cell) ** 2) * (L.herd || 1)
    L.step = Math.max(2, L.radius * .06) // how far the walker goes before this layer is scattered afresh
    L.meshes = L.forms.map(f => {
      f.geometry.setAttribute('reach', new THREE.InstancedBufferAttribute(new Float32Array(cap).fill(L.radius - L.step), 1))
      if (f.leg) f.geometry.setAttribute('pose', new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4))
      const m = new THREE.InstancedMesh(f.geometry, f.mats.map(k => mats[k]), cap)
      m.customDepthMaterial = mats[f.mats[0]].shade
      m.frustumCulled = false; m.receiveShadow = true; m.castShadow = L.shadow !== false
      m.onBeforeShadow = () => { m.all = m.count; m.count = m.near }
      m.onAfterShadow = () => (m.count = m.all)
      scene.add(m)
      return m
    })
    L.at = (ix, iz) => { // what grows in this cell: the same answer every time it is asked
      let k = li * 64
      const r = () => hash(ix, iz, k++), x = (ix + r()) * L.cell, z = (iz + r()) * L.cell, hit = L.rule({ x, z, ...fields(x, z) }, r)
      return hit && { x, z, r, form: hit[0], s: hit[1], more: hit[2], key: ix + ',' + iz, k }
    }
    L.seen = new Map()
    L.block = (ix, iz) => { // what stands in this cell that cannot be walked through: a disc, or for a log the length of it
      const key = ix * 1e5 + iz
      let o = L.seen.get(key)
      if (o === undefined) {
        const c = L.at(ix, iz), f = c && L.forms[c.form], rad = c ? (L.hard(f, c.s, c.form) || 0) * c.s : 0
        const yaw = c && hash(ix, iz, c.k + 1) * 6.283, len = c && L.long ? f.tall * c.s * (.82 + hash(ix, iz, c.k + 3) * .36) : 0 // the turn and build put() will give it
        if (L.seen.size > 5e4) L.seen.clear()
        L.seen.set(key, o = rad ? { x: c.x, z: c.z, r: rad, dx: -Math.cos(yaw) * len, dz: Math.sin(yaw) * len } : null)
      }
      return o
    }
    L.fill = (cx, cz) => {
      L.meshes.forEach(m => (m.count = 0)); L.live = []
      const was = L.memo; L.memo = new Map() // whatever moves keeps its place and its mind when the layer is scattered afresh
      const n = Math.ceil(L.radius / L.cell), ox = Math.round(cx / L.cell), oz = Math.round(cz / L.cell)
      const hits = []
      for (let ix = ox - n; ix <= ox + n; ix++) for (let iz = oz - n; iz <= oz + n; iz++) {
        const c = L.at(ix, iz)
        if (c && (c.far = Math.hypot(c.x - cx, c.z - cz) / L.radius) <= 1) hits.push(c)
      }
      L.meshes.forEach(m => (m.near = 0))
      const put = (c, form, s, key, lead) => {
        const { x, z, r, far } = c, m = L.meshes[form], y = height(x, z) - (L.sink || 0) * s, t = L.tilt || 0
        d.position.set(x, y, z); d.rotation.set((r() - .5) * t, r() * 6.283, (r() - .5) * t); d.scale.set(s * (c.w = .82 + r() * .36), s * (2 - c.w), s * c.w); d.updateMatrix() // every one its own build
        const h = L.move && r(), o = L.move && Object.assign(was?.get(key) || { x, y, z, s, h, leg: L.forms[form].leg, room: L.forms[form].room * s }, { m, i: m.count, lead })
        if (o) { L.live.push(o); L.memo.set(key, o) }
        m.setMatrixAt(m.count, d.matrix)
        const warm = r() < .1 ? .4 : 0 // one in ten is turning
        if (far * L.radius < 125 + L.step) m.near++ // beyond this the sun's shadow map does not reach
        m.setColorAt(m.count++, tint.setRGB(.8 + r() * .4 + warm, .8 + r() * .4, .75 + r() * .4 - warm))
        return o
      }
      for (const c of hits.sort((a, b) => a.far - b.far)) { // nearest first, so the shadow pass can stop early
        const o = put(c, c.form, c.s, c.key)
        c.more?.forEach((e, j) => put({ ...c, x: c.x + Math.cos(j * 2.4) * 3, z: c.z + Math.sin(j * 2.4) * 3 }, e[0], e[1], c.key + j, o)) // the rest of the family
      }
      L.meshes.forEach(m => { m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true })
    }
  })

  // ground: one sheet that follows the walker, coloured by the same fields
  const N = 190, SIZE = 380, step = SIZE / N, g = new THREE.PlaneGeometry(SIZE, SIZE, N, N).rotateX(-Math.PI / 2)
  g.setAttribute('color', new THREE.BufferAttribute(new Float32Array((N + 1) ** 2 * 3), 3))
  const ground = new THREE.Mesh(g, mats.ground)
  ground.receiveShadow = true; ground.frustumCulled = false
  scene.add(ground)
  const lay = { step: 5, fill(cx, cz) {
    const Q = g.attributes.position, C = g.attributes.color, U = g.attributes.uv, ox = Math.round(cx / step) * step, oz = Math.round(cz / step) * step
    for (let i = 0; i < Q.count; i++) {
      const x = (i % (N + 1) - N / 2) * step + ox, z = ((i / (N + 1) | 0) - N / 2) * step + oz, e = fields(x, z), k = .75 + .5 * noise(x * .3, z * .3, 9)
      let c = mix([.36, .29, .21], [.26, .42, .1], sat(e.wet * 6 - 2.6) * sat(noise(x * .11, z * .11, 8) * 2.2 - .4))
      c = mix(c, [.45, .26, .1], .6 * sat(noise(x * .05, z * .05, 14) * 3 - 1.5) * (1 - e.gap))                       // drifts of last year's leaves under the thickest canopy
      c = mix(c, [.16, .13, .1], .7 * sat(noise(x * .08, z * .08, 18) * 4 - 2.7))                                    // bare dark earth
      c = mix(mix(c, mix([.2, .42, .07], [.38, .4, .13], sat(noise(x * .09, z * .09, 15) * 3 - .8)), e.glade), [.5, .43, .33], sat(1.7 - e.path / 1.1)) // meadow, paling where the grass stands tall
      Q.setXYZ(i, x, height(x, z), z); U.setXY(i, x * .3, z * .3); C.setXYZ(i, c[0] * k, c[1] * k, c[2] * k)
    }
    g.computeVertexNormals()
    Q.needsUpdate = C.needsUpdate = U.needsUpdate = true
  } }

  const jobs = [lay, ...layers]
  let grown, then = 0
  const hard = layers.filter(L => L.hard), trunks = hard.slice(0, 1)
  const solid = (p, room = .35, tall) => { // push p out of whatever is solid nearby: ask each rule what stands in the neighbouring cells. tall: only trunks, for what flies
    let hit = 0
    for (const L of tall ? trunks : hard) {
      const ox = Math.round(p.x / L.cell), oz = Math.round(p.z / L.cell)
      for (let ix = ox - 2; ix <= ox + 1; ix++) for (let iz = oz - 2; iz <= oz + 1; iz++) {
        const c = L.block(ix, iz)
        if (!c) continue
        const k = c.dx || c.dz ? sat(((p.x - c.x) * c.dx + (p.z - c.z) * c.dz) / (c.dx * c.dx + c.dz * c.dz)) : 0, qx = c.x + c.dx * k, qz = c.z + c.dz * k
        const far = Math.hypot(p.x - qx, p.z - qz), gap = c.r + room
        if (far < gap && far > 1e-4) { p.x = qx + (p.x - qx) / far * gap; p.z = qz + (p.z - qz) / far * gap; hit = 1 }
      }
    }
    return hit
  }
  return Object.assign((x, z, t, day) => {
    const dt = Math.min(t - then, .1); then = t // day: 0 at night; sleeps says who keeps which hours
    for (const j of jobs) if (!(Math.hypot(x - j.fx, z - j.fz) < j.step)) { // one refill a frame once grown, so no frame carries them all
      j.fill(j.fx = x, j.fz = z)
      if (grown) break
    }
    grown = 1
    for (const L of layers) if (L.move) {
      for (const o of L.live) { d.rotation.set(0, 0, 0, 'XYZ'); d.scale.setScalar(L.sleeps ? o.s * sat(.5 + L.sleeps * (day * 3 - 1)) : o.s)
        const pose = L.move(d, o, t, dt, x, z, solid, L.live, day); d.updateMatrix(); o.m.setMatrixAt(o.i, d.matrix)
        if (pose) o.m.geometry.attributes.pose.setXYZW(o.i, ...pose) }
      L.meshes.forEach(m => { m.instanceMatrix.needsUpdate = true; if (m.geometry.attributes.pose) m.geometry.attributes.pose.needsUpdate = true })
    }
  }, { collide: solid })
}
