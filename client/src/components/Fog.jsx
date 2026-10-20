import { useEffect, useRef } from 'react'
import { prefersReducedMotion } from '../lib/motion.js'

/**
 * Ground mist for the landing scene (SW-ADR-159). Rolling banks of fog that
 * lurk on the glass floor and drift across the whole first screen, the words
 * included. Thin wisps ride higher up.
 *
 * The banks are billowed, the way the owner's reference is (2026-10-20):
 * clumps heaped like cauliflower, lit along their tops, dark underneath, with
 * a noisy smoke texture, piled either side with a clearer path down the
 * middle where the tree stands. Each bank is rendered ONCE into an offscreen
 * canvas (a metaball silhouette, domain-warped by fractal noise), so a frame
 * is a few dozen drawImage calls at half resolution. Reduced motion draws one
 * still frame. It pauses off screen and in hidden tabs.
 *
 * `floor` is a selector for the floor element: the mist is laid ON its top
 * edge, rising around whatever stands there, so it never reads as fog under
 * the ground. Without one, `ground` (a fraction of the box's height) is used.
 */
function seeded(seed) {
  let r = seed
  return () => { r = (r * 16807) % 2147483647; return r / 2147483647 }
}

/** Value noise summed over five octaves, in about 0..1. */
function fractalNoise(seed) {
  const hash = (x, y) => {
    let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(seed, 2246822519)
    h = Math.imul(h ^ (h >>> 13), 1274126177)
    return ((h ^ (h >>> 16)) >>> 0) / 4294967295
  }
  const ease = (t) => t * t * (3 - 2 * t)
  const noise = (x, y) => {
    const xi = Math.floor(x); const yi = Math.floor(y)
    const u = ease(x - xi); const v = ease(y - yi)
    const a = hash(xi, yi); const b = hash(xi + 1, yi)
    const c = hash(xi, yi + 1); const d = hash(xi + 1, yi + 1)
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v
  }
  return (x, y) => {
    let t = 0; let amp = 0.5; let f = 1
    for (let o = 0; o < 5; o += 1) { t += amp * noise(x * f, y * f); f *= 2.03; amp *= 0.5 }
    return t
  }
}

const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t) }

/** One billowing bank: heaped clumps, lit tops, shadowed base, smoke texture. */
function makeBank(colour, seed) {
  const W = 448; const H = 224
  const rand = seeded(seed)
  const fbm = fractalNoise(seed)
  const balls = []
  // a row of broad clumps along the base...
  for (let i = 0; i < 6; i += 1) {
    balls.push([W * (0.1 + 0.8 * (i / 5) + (rand() - 0.5) * 0.06), H * (0.7 + rand() * 0.06), H * (0.17 + rand() * 0.07)])
  }
  // ...heaped higher towards the middle, smaller as they rise
  for (let i = 0; i < 8; i += 1) {
    const x = 0.18 + rand() * 0.64
    const lift = 1 - Math.abs(x - 0.5) * 2
    balls.push([W * x, H * (0.6 - 0.32 * lift * (0.6 + rand() * 0.4)), H * (0.1 + rand() * 0.08 + 0.05 * lift)])
  }
  const field = (x, y) => {
    let f = 0
    for (const [cx, cy, r] of balls) {
      const dx = x - cx; const dy = y - cy
      f += Math.exp(-(dx * dx + dy * dy) / (r * r))
    }
    return f
  }
  const [cr, cg, cb] = colour.split(/\s+/).map(Number)
  const c = document.createElement('canvas')
  c.width = W
  c.height = H
  const g = c.getContext('2d')
  const img = g.createImageData(W, H)
  const px = img.data
  for (let y = 0; y < H; y += 1) {
    for (let x = 0; x < W; x += 1) {
      // warp the silhouette with noise, so the edges curl and tear like smoke
      const wx = x + (fbm(x * 0.018, y * 0.018) - 0.5) * 46
      const wy = y + (fbm(x * 0.018 + 5.2, y * 0.018 + 1.3) - 0.5) * 34
      const f = field(wx, wy)
      const n = fbm(x * 0.04 + 9.1, y * 0.04 + 3.7)
      const grain = fbm(x * 0.06 + 2.3, y * 0.06 + 7.9) // the smoke's fine texture
      const d = f + (n - 0.5) * 1.1
      let a = smooth(0.2, 0.95, d) * (1 - smooth(H * 0.78, H, y)) * smooth(0, W * 0.1, Math.min(x, W - x))
      if (a <= 0.003) continue
      a *= 0.9 + (grain - 0.5) * 0.3
      // light from above: a surface whose density rises downward faces up
      const lit = f - field(wx, wy - 9)
      let shade = 0.48 + lit * 1.2 + (n - 0.5) * 0.8 + (grain - 0.5) * 0.25
      shade = Math.min(1, Math.max(0, shade)) * (1 - 0.4 * (y / H))
      const k = 0.24 + 0.76 * shade
      const o = (y * W + x) * 4
      px[o] = cr * k; px[o + 1] = cg * k; px[o + 2] = cb * k; px[o + 3] = a * 255
    }
  }
  g.putImageData(img, 0, 0)
  return c
}

/** A thin soft wisp for the fog that rides higher up. */
function makePuff(colour, seed) {
  const S = 256
  const c = document.createElement('canvas')
  c.width = S
  c.height = S
  const g = c.getContext('2d')
  let r = seed
  const rand = () => { r = (r * 16807) % 2147483647; return r / 2147483647 }
  for (let i = 0; i < 14; i += 1) {
    const x = S * (0.25 + rand() * 0.5)
    const y = S * (0.35 + rand() * 0.3)
    const rad = S * (0.12 + rand() * 0.2)
    const grd = g.createRadialGradient(x, y, 0, x, y, rad)
    grd.addColorStop(0, `rgb(${colour} / 0.16)`)
    grd.addColorStop(1, `rgb(${colour} / 0)`)
    g.fillStyle = grd
    g.beginPath()
    g.arc(x, y, rad, 0, Math.PI * 2)
    g.fill()
  }
  return c
}

/**
 * `layer` is 'front' (over the tree and the words) or 'back' (behind the
 * tree, so the mist is seen between the trunk and the lower branches).
 * `stage` is a selector for the tree's box: the fog stays below its lower
 * third, around the trunk and the lowest branches, and the crown and the sky
 * above it stay clear.
 */
export default function Fog({ ground: groundDefault = 0.72, floor = null, stage = null,
                              layer = 'front', className = '' }) {
  const ref = useRef(null)

  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return undefined
    const ctx = canvas.getContext('2d')
    if (!ctx) return undefined
    const colour = getComputedStyle(canvas).getPropertyValue('--sw-dusk-fog').trim() || '220 228 220'
    const base = layer === 'back' ? 900 : 0
    const clumps = [7, 101, 4242, 55, 909].map((s) => makeBank(colour, base + s))
    const wisp = makePuff(colour, base + 31)
    const SCALE = 0.5
    let W = 1; let H = 1
    let ground = groundDefault
    let reach = 0.18 // how far above the floor the fog may heap, as a fraction of H
    let banks = []
    let raf = 0; let last = 0; let running = false; let visible = true
    let pageVisible = !document.hidden
    const reduced = prefersReducedMotion()

    const seed = () => {
      const rand = seeded(base + 77)
      const phone = W < 700
      const plan = layer === 'back'
        ? [['on', phone ? 6 : 10], ['mid', phone ? 3 : 5]]
        : [['on', phone ? 7 : 12], ['near', phone ? 3 : 5], ['mid', phone ? 2 : 4], ['veil', 3]]
      const top = H * (ground - reach) // nothing heaps above this line
      banks = plan.flatMap(([kind, n]) => Array.from({ length: n }, (_, i) => {
        const span = H * reach
        // clumps heaped ON the floor, rising around the trunk; the nearer glass
        // carries lower, broader banks; a few smaller clumps hang at the
        // lowest branches; a flat veil ties them together
        const h = kind === 'on' ? span * (0.75 + rand() * 0.45)
          : kind === 'near' ? span * (0.7 + rand() * 0.5)
            : kind === 'mid' ? span * (0.4 + rand() * 0.3)
              : span * 0.35
        const w = kind === 'veil' ? W * (0.7 + rand() * 0.5) : h * (1.8 + rand() * 0.6)
        const bottom = kind === 'on' ? H * ground + h * (0.12 + rand() * 0.18)
          : kind === 'near' ? H * ground + h * (0.55 + rand() * 0.45)
            : kind === 'mid' ? top + h * (0.9 + rand() * 0.5)
              : H * ground + h * 0.4
        return {
          kind,
          img: kind === 'veil' ? wisp : clumps[(i * 2 + (kind === 'mid' ? 1 : 0) + (kind === 'near' ? 3 : 0)) % clumps.length],
          flip: rand() < 0.5,
          x: ((i + rand() * 0.8) / n) * (W + w) - w,
          y: bottom - h / 2,
          w,
          h,
          vx: (4 + rand() * 9) * (W / 1400) * (rand() < 0.8 ? 1 : -0.7),
          a: kind === 'on' ? 0.7 + rand() * 0.3 : kind === 'near' ? 0.55 + rand() * 0.3
            : kind === 'mid' ? 0.3 + rand() * 0.25 : 0.35,
          bob: rand() * 6.28,
        }
      }))
    }

    // in front of the trunk the mist thins, the way the reference keeps a
    // clearer path down the middle; behind it, it stays whole
    const veilAt = (cx) => {
      if (layer === 'back') return 1
      const off = Math.abs(cx - W / 2) / Math.max(1, W * 0.22)
      return 0.55 + 0.45 * Math.min(1, off)
    }

    const measure = () => {
      const r = canvas.getBoundingClientRect()
      W = Math.max(1, r.width); H = Math.max(1, r.height)
      const el = floor && canvas.parentElement?.querySelector(floor)
      if (el) ground = Math.min(0.95, Math.max(0.3, (el.getBoundingClientRect().top - r.top) / H))
      const st = stage && canvas.parentElement?.querySelector(stage)
      if (st) {
        // the tree stands from the stage's top to the floor; the fog may climb
        // about a third of that, to the lowest branches
        const treeTop = (st.getBoundingClientRect().top - r.top) / H
        reach = Math.max(0.06, (ground - treeTop) * 0.32)
      }
      canvas.width = Math.round(W * SCALE)
      canvas.height = Math.round(H * SCALE)
      ctx.setTransform(SCALE, 0, 0, SCALE, 0, 0)
      seed()
    }

    const draw = (dt) => {
      ctx.clearRect(0, 0, W, H)
      for (const b of banks) {
        b.x += b.vx * dt
        b.bob += dt * 0.25
        if (b.vx > 0 && b.x > W) b.x = -b.w
        if (b.vx < 0 && b.x + b.w < 0) b.x = W
        // a slow roll: each bank breathes a little wider and lower, and back
        const roll = 1 + 0.04 * Math.sin(b.bob)
        const w = b.w * roll; const h = b.h * (2 - roll)
        ctx.globalAlpha = b.a * (0.85 + 0.15 * Math.sin(b.bob * 0.7)) * veilAt(b.x + b.w / 2)
        const left = b.x - (w - b.w) / 2
        if (b.flip) {
          // mirrored, so five shapes read as many
          ctx.save()
          ctx.setTransform(-SCALE, 0, 0, SCALE, (2 * left + w) * SCALE, 0)
          ctx.drawImage(b.img, left, b.y + b.h / 2 - h, w, h)
          ctx.restore()
        } else {
          ctx.drawImage(b.img, left, b.y + b.h / 2 - h, w, h)
        }
      }
      ctx.globalAlpha = 1
    }

    const frame = (now) => {
      const dt = Math.min(0.05, (now - last) / 1000 || 0)
      last = now
      draw(dt)
      raf = requestAnimationFrame(frame)
    }
    const start = () => {
      if (running || reduced || !visible || !pageVisible) return
      running = true
      last = performance.now()
      raf = requestAnimationFrame(frame)
    }
    const stop = () => { running = false; cancelAnimationFrame(raf) }

    measure()
    draw(0)
    const ro = new ResizeObserver(() => { measure(); draw(0) })
    ro.observe(canvas)
    const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; if (visible) start(); else stop() })
    io.observe(canvas)
    const onVis = () => { pageVisible = !document.hidden; if (pageVisible) start(); else stop() }
    document.addEventListener('visibilitychange', onVis)
    start()
    return () => {
      stop()
      ro.disconnect()
      io.disconnect()
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [groundDefault, floor, stage, layer])

  return <canvas ref={ref} className={`fog ${className}`.trim()} aria-hidden="true" />
}
