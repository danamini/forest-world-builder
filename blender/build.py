# Builds every asset the forest needs. Run: Blender -b -P blender/build.py
#   public/primitives.glb  five primitives the browser bends into every form
#   public/sprigs_*.webp   foliage atlas (colour+alpha, normal) rendered from modelled sprigs
#   public/{bark,rock,ground}_{c,n}.webp  tileable surface maps
import bpy, bmesh, math, os, random
import numpy as np
from mathutils import Matrix, Vector

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'public')
os.makedirs(OUT, exist_ok=True)
random.seed(11)
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene


def add(name, bm):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    for p in me.polygons:
        p.use_smooth = True
    ob = bpy.data.objects.new(name, me)
    scene.collection.objects.link(ob)
    return ob


# ---------------------------------------------------------------- primitives
def tube(name, sides, ts):
    """Unit cylinder along Z. The browser sweeps it along curves: trunks, limbs, logs, stems."""
    bm = bmesh.new()
    uv = bm.loops.layers.uv.new()
    ring = lambda t: [bm.verts.new((math.cos(a), math.sin(a), t)) for a in (2 * math.pi * i / sides for i in range(sides))]
    rings = [ring(t) for t in ts]
    for j in range(len(ts) - 1):
        for i in range(sides):
            k = (i + 1) % sides
            f = bm.faces.new((rings[j][i], rings[j][k], rings[j + 1][k], rings[j + 1][i]))
            for l, (u, v) in zip(f.loops, ((i, j), (i + 1, j), (i + 1, j + 1), (i, j + 1))):
                l[uv].uv = (u / sides, ts[v])
    return add(name, bm)


def grid(name, nx, nz):
    """Flat strip in XZ, pivot at the bottom centre: leaf cards, fronds, grass blades."""
    bm = bmesh.new()
    uv = bm.loops.layers.uv.new()
    v = [[bm.verts.new((i / nx - .5, 0, j / nz)) for i in range(nx + 1)] for j in range(nz + 1)]
    for j in range(nz):
        for i in range(nx):
            f = bm.faces.new((v[j][i], v[j][i + 1], v[j + 1][i + 1], v[j + 1][i]))
            for l in f.loops:
                l[uv].uv = (l.vert.co.x + .5, l.vert.co.z)
    return add(name, bm)


def blob(name, cuts):
    """Cube inflated to a sphere: rocks, mushroom caps, moss mounds."""
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=2)
    bmesh.ops.subdivide_edges(bm, edges=bm.edges[:], cuts=cuts, use_grid_fill=True)
    for v in bm.verts:
        v.co.normalize()
    return add(name, bm)


caps = lambda n: [0, .002] + [i / n for i in range(1, n)] + [.998, 1]
prims = [tube('tube', 12, caps(10)), tube('twig', 5, [i / 4 for i in range(5)]),
         grid('card', 2, 2), grid('blade', 1, 5), blob('blob', 5)]
for o in prims:
    o.select_set(True)
bpy.ops.export_scene.gltf(filepath=os.path.join(OUT, 'primitives.glb'), export_format='GLB',
                          use_selection=True, export_materials='NONE', export_yup=True)
for o in prims:
    bpy.data.objects.remove(o)


# ------------------------------------------------------------------- sprigs
# Real leaf geometry, rendered straight down into a 2x2 atlas. Each cell holds one
# sprig growing up from its bottom-centre, so a card pivots where the sprig attaches.
bm = bmesh.new()
col = bm.loops.layers.float_color.new('c')
vary = lambda c, k=.22: tuple(x * random.uniform(1 - k, 1 + k) for x in c[:3]) + (1,)


def leaf(M, L, W, c, n=10, serr=0, fold=.25, shape=lambda t: math.sin(math.pi * t ** .75)):
    rows = []
    for i in range(n + 1):
        t = i / n
        w = W * .5 * shape(t) * (1 + serr * (i % 2 * 2 - 1))
        rows.append([bm.verts.new(M @ Vector((x * w, t * L, abs(x) * w * fold - .25 * L * t * t))) for x in (-1, 0, 1)])
    for a, b in zip(rows, rows[1:]):
        for k in (0, 1):
            f = bm.faces.new((a[k], a[k + 1], b[k + 1], b[k]))
            for l in f.loops:
                vein = 1.25 if l.vert in (a[1], b[1]) else .9
                l[col] = tuple(x * vein for x in c[:3]) + (1,)


def twig(M, L, n, lL, lW, c, ang=50, opp=False, prof=lambda t: 1, sub=0, serr=0, stem=.014):
    leaf(M, L, stem, (.10, .07, .04), fold=0, shape=lambda t: 1 - .6 * t)
    for i in range(n):
        t = (i + 1) / (n + .6)
        for s in ((-1, 1) if opp else ((-1, 1)[i % 2],)):
            a = math.radians(ang * (1 - .35 * t) + random.uniform(-9, 9))
            T = (M @ Matrix.Translation((0, t * L, random.uniform(.002, .02))) @ Matrix.Rotation(-s * a, 4, 'Z')
                 @ Matrix.Rotation(random.uniform(-.5, .5), 4, 'Y'))
            k = prof(t) * random.uniform(.8, 1.1)
            if sub:
                twig(T, L * .5 * k, sub, lL, lW, c, ang, opp, serr=serr, stem=stem * .7)
            else:
                leaf(T, lL * k, lW * k, vary(c), serr=serr)
    leaf(M @ Matrix.Translation((0, L, .01)), lL * prof(1), lW * prof(1), vary(c), serr=serr)


at = lambda x, y, deg=0, z=0: Matrix.Translation((x, y, z)) @ Matrix.Rotation(math.radians(deg), 4, 'Z')
# cell 0: broadleaf spray
twig(at(.5, .02), .7, 13, .17, .085, (.14, .30, .05), serr=.05)
for d, y in ((40, .14), (-36, .24), (30, .38)):
    twig(at(.5, y, d), .4, 9, .14, .07, (.16, .32, .05), serr=.05)
# cell 1: conifer bough, needles on twiglets
twig(at(1.5, .02), .84, 8, .06, .009, (.045, .15, .06), ang=58, opp=True, sub=30, prof=lambda t: 1.0 - .7 * t, stem=.02)
twig(at(1.5, .02, z=.02), .84, 46, .06, .009, (.05, .17, .06), ang=40, opp=True, stem=.02)
# cell 2: fern frond, paired pinnae tapering to the tip
twig(at(.5, 1.02), .86, 30, .25, .034, (.10, .30, .04), ang=80, opp=True, serr=.22,
     prof=lambda t: math.sin(math.pi * min(1, t * .8 + .22)) ** .8, stem=.012)
# cell 3: dense leaf cluster, a fan of small twigs
for d in (-75, -56, -38, -19, 0, 19, 38, 56, 75):
    twig(at(1.5, 1.03, d + random.uniform(-8, 8), random.uniform(0, .05)), random.uniform(.45, .72) * (1 - abs(d) / 200),
         10, .13, .07, (.13, .27, .045), serr=.05)
add('sprigs', bm)

mat = bpy.data.materials.new('leaf')
mat.use_nodes = True
nt = mat.node_tree
nt.nodes.clear()
attr, bsdf, out = (nt.nodes.new(t) for t in ('ShaderNodeAttribute', 'ShaderNodeBsdfDiffuse', 'ShaderNodeOutputMaterial'))
attr.attribute_name = 'c'
nt.links.new(attr.outputs['Color'], bsdf.inputs['Color'])
nt.links.new(bsdf.outputs['BSDF'], out.inputs['Surface'])
bpy.data.objects['sprigs'].data.materials.append(mat)

nmat = bpy.data.materials.new('normal')  # override: paints the world normal, which is tangent space for a flat card
nmat.use_nodes = True
nt = nmat.node_tree
nt.nodes.clear()
geo, mad, emi, out = (nt.nodes.new(t) for t in ('ShaderNodeNewGeometry', 'ShaderNodeVectorMath', 'ShaderNodeEmission', 'ShaderNodeOutputMaterial'))
mad.operation = 'MULTIPLY_ADD'
mad.inputs[1].default_value = mad.inputs[2].default_value = (.5, .5, .5)
nt.links.new(geo.outputs['Normal'], mad.inputs[0])
nt.links.new(mad.outputs[0], emi.inputs['Color'])
nt.links.new(emi.outputs[0], out.inputs['Surface'])

cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam'))
cam.data.type, cam.data.ortho_scale, cam.location = 'ORTHO', 2, (1, 1, 5)
scene.collection.objects.link(cam)
scene.camera = cam
world = bpy.data.worlds.new('w')
world.use_nodes = True
world.node_tree.nodes['Background'].inputs[0].default_value = (1, 1, 1, 1)  # even sky: albedo with soft self-occlusion
scene.world = world
scene.render.engine = 'CYCLES'
scene.cycles.samples = 64
scene.render.film_transparent = True
scene.render.resolution_x = scene.render.resolution_y = N = 2048
scene.render.image_settings.file_format = 'PNG'
scene.render.image_settings.color_mode = 'RGBA'


def shoot(transform, override=None):
    scene.view_settings.view_transform = transform
    bpy.context.view_layer.material_override = override
    scene.render.filepath = os.path.join(OUT, '_shot.png')
    bpy.ops.render.render(write_still=True)
    img = bpy.data.images.load(scene.render.filepath)
    px = np.empty(N * N * 4, np.float32)
    img.pixels.foreach_get(px)
    return px.reshape(N, N, 4)


def save(name, px, quality=80):  # WebP: a fifth the weight of PNG and JPEG at the same look. Colour maps take 65; normals keep 80, where blocking would show as false relief
    h, w, ch = px.shape
    if ch == 3:
        px = np.dstack([px, np.ones((h, w))])
    img = bpy.data.images.new(name, w, h, alpha=True)
    img.pixels.foreach_set(np.clip(px, 0, 1).astype(np.float32).ravel())
    img.filepath_raw, img.file_format = os.path.join(OUT, name + '.webp'), 'WEBP'
    img.save(quality=quality)


c = shoot('Standard')
n = shoot('Raw', nmat)
a = c[..., 3:]
rgb, m = c[..., :3] * (a > .5), (a > .5).astype(np.float32)
for _ in range(24):  # bleed leaf colour outward so mipmaps never pull in a dark fringe
    nb = sum(np.roll(rgb, s, ax) for s in (1, -1) for ax in (0, 1))
    nm = sum(np.roll(m, s, ax) for s in (1, -1) for ax in (0, 1))
    grow = (m == 0) & (nm > 0)
    rgb = np.where(grow, nb / np.maximum(nm, 1), rgb)
    m = np.where(grow, 1, m)
rgb = np.where(m > 0, rgb, rgb.sum((0, 1)) / m.sum())
save('sprigs_c', np.dstack([rgb, a]), 70)
save('sprigs_n', np.where(n[..., 3:] > .5, n[..., :3], (.5, .5, 1)))


# ------------------------------------------------------------- surface maps
# Tileable by construction: noise is shaped in frequency space, so it wraps exactly.
S = 1024


def fnoise(seed, beta, sx=1, sy=1, lo=0, hi=1e9):
    r = np.random.default_rng(seed)
    f = np.hypot(np.fft.fftfreq(S)[None, :] * S * sx, np.fft.fftfreq(S)[:, None] * S * sy)
    f[0, 0] = 1
    amp = f ** -beta * (f >= lo) * (f <= hi)
    amp[0, 0] = 0
    x = np.fft.ifft2(amp * np.exp(2j * np.pi * r.random((S, S)))).real
    x = (x - x.mean()) / x.std()
    return np.clip(x * .22 + .5, 0, 1)


def normal(h, k):
    dx = (np.roll(h, -1, 1) - np.roll(h, 1, 1)) * k
    dy = (np.roll(h, -1, 0) - np.roll(h, 1, 0)) * k
    n = np.dstack([-dx, -dy, np.ones_like(h)])
    return n / np.linalg.norm(n, axis=2, keepdims=True) * .5 + .5


mix = lambda a, b, t: np.asarray(a) * (1 - t[..., None]) + np.asarray(b) * t[..., None]
step = lambda x, a, b: np.clip((x - a) / (b - a), 0, 1)
half = lambda p: (p[::2, ::2] + p[1::2, ::2] + p[::2, 1::2] + p[1::2, 1::2]) / 4  # relief maps ship at half size: noise is what costs bytes

# bark: plates split by long vertical fissures, a little lichen
plate = step(np.abs(fnoise(1, 1.1, 1, 6, lo=5) * 2 - 1), .02, .3) ** .7
h = plate * .8 + fnoise(2, 1.2, 1, 3, lo=20) * .35
c = mix((.16, .13, .11), (.70, .65, .60), step(h, .1, .95)) * (.8 + .4 * fnoise(3, 1.6)[..., None])
c = mix(c, (.62, .70, .52), step(fnoise(4, 2.2), .7, .8) * .35)
save('bark_c', c, 65)
save('bark_n', half(normal(h, 9)))

# rock: weathered mass with thin cracks
crack = step(np.abs(fnoise(5, 1.7) * 2 - 1), 0, .035)
h = fnoise(6, 2) * .7 + fnoise(7, 1.1, lo=30) * .25 + crack * .3
c = mix((.34, .33, .31), (.80, .78, .74), step(h, .25, 1.05)) * (.55 + .45 * crack[..., None])
save('rock_c', c, 65)
save('rock_n', half(normal(h, 7)))

# ground: a real litter bed. Leaves, needles and twigs strewn over soil with the sprig tools,
# wrapped across the tile edges, then rendered like the atlas. The browser tints it per biome.
bm = bmesh.new()
col = bm.loops.layers.float_color.new('c')
soil = bm.faces.new([bm.verts.new((x, y, -.004)) for x, y in ((9, -1), (12, -1), (12, 2), (9, 2))])
for l in soil.loops:
    l[col] = (.035, .026, .018, 1)


def strew(n, make):
    for i in range(n):
        x, y, a, z = random.random(), random.random(), random.uniform(0, 360), i / n * .012
        state = random.getstate()
        for dx in (-1, 0, 1):
            for dy in (-1, 0, 1):
                if -.2 < x + dx < 1.2 and -.2 < y + dy < 1.2:
                    random.setstate(state)  # every wrapped copy is the same leaf
                    make(at(10 + x + dx, y + dy, a, z) @ Matrix.Rotation(random.uniform(-.5, .5), 4, 'X') @ Matrix.Rotation(random.uniform(-.5, .5), 4, 'Y'))


browns = ((.22, .11, .04), (.30, .17, .06), (.12, .065, .03), (.38, .26, .09), (.17, .13, .05), (.10, .13, .04))
strew(2600, lambda M: leaf(M, random.uniform(.022, .04), random.uniform(.012, .022), vary(random.choice(browns), .3), n=4, fold=.5))
strew(2200, lambda M: leaf(M, random.uniform(.012, .028), .0022, vary((.20, .12, .05), .3), n=2, fold=0))
strew(70, lambda M: leaf(M, random.uniform(.08, .3), random.uniform(.003, .007), vary((.07, .05, .035)), n=6, fold=0, shape=lambda t: 1 - .4 * t))
add('litter', bm).data.materials.append(mat)
cam.location, cam.data.ortho_scale = (10.5, .5, 5), 1
scene.render.resolution_x = scene.render.resolution_y = N = 1024
save('ground_c', shoot('Standard')[..., :3], 65)
save('ground_n', shoot('Raw', nmat)[..., :3])
os.remove(os.path.join(OUT, '_shot.png'))
print('assets written to', os.path.abspath(OUT))
