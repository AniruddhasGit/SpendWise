import { useEffect, useRef } from 'react'
import { prefersReducedMotion } from '../lib/motion.js'

/**
 * Ground fog for the landing scene (SW-ADR-159).
 *
 * The owner's sketch and reference (2026-10-21): fog that starts where the
 * trunk meets the ground and carries on, a sea of it, down to the bottom of
 * the first screen, so the scene reads as a 3D world seen from a raised
 * camera. A bright, dense band lies along the ground line with smoke curling
 * up off its top; below it the fog is dimmer and softer. A steady wind blows
 * right to left.
 *
 * The fog is one real texture (`/assets/fog/ground-fog.jpg`, made with Runway;
 * provenance beside it), grey on black. It is tinted once into the dusk fog
 * ink with its brightness as alpha, then tiled across the screen, every other
 * tile mirrored so the joins never show. Two layers drift at different speeds
 * for depth: the band, and a larger, dimmer, faster sea below it. Positions
 * move by sub-pixel amounts on a time base, never stepped, so the drift is
 * smooth. Reduced motion draws one still frame. It pauses off screen and in
 * hidden tabs, and the scene clips it to the first screen.
 *
 * `layer`: 'front' (over the tree, thinned over the trunk) or 'back' (behind
 * the tree, so the trunk rises out of the fog). `floor` and `stage` are
 * selectors: the band sits on the floor's top edge, and its size follows the
 * tree's height (a sixth of it).
 */
const SRC = '/assets/fog/ground-fog.jpg'
// where the band sits in the texture, as fractions of its height
const BAND_CORE = 0.42
const SEA_FROM = 0.55
const EDGE = 0.53 // the hard line under the band, softened in `tint`

function tint(img, colour) {
  const c = document.createElement('canvas')
  c.width = img.naturalWidth
  c.height = img.naturalHeight
  const g = c.getContext('2d')
  g.drawImage(img, 0, 0)
  const data = g.getImageData(0, 0, c.width, c.height)
  const px = data.data
  const [r, gr, b] = colour.split(/\s+/).map(Number)
  // the texture has a hard horizontal edge under the band: blend it away with
  // a vertical blur that is strongest on that edge and fades out either side
  const w = c.width; const h = c.height
  const edge = Math.round(h * EDGE); const reach = Math.round(h * 0.16); const rad = Math.round(h * 0.08)
  const src = new Float32Array(w * h)
  for (let i = 0; i < w * h; i += 1) src[i] = px[i * 4] / 255
  const lumAt = new Float32Array(src)
  for (let y = Math.max(rad, edge - reach); y < Math.min(h - rad, edge + reach); y += 1) {
    const d = Math.abs(y - edge) / reach
    const mix = (1 - d) * (1 - d) * (3 - 2 * (1 - d)) // smooth, 1 on the edge
    for (let x = 0; x < w; x += 1) {
      let sum = 0
      for (let k = -rad; k <= rad; k += 1) sum += src[(y + k) * w + x]
      lumAt[y * w + x] = src[y * w + x] * (1 - mix) + (sum / (2 * rad + 1)) * mix
    }
  }
  // and its top and bottom fade to nothing, so no layer ends on a straight line
  const ramp = (y) => {
    const top = Math.min(1, y / (h * 0.06))
    const bottom = Math.min(1, (h - y) / (h * 0.3))
    const v = Math.min(top, bottom)
    return v * v * (3 - 2 * v)
  }
  for (let i = 0; i < px.length; i += 4) {
    const lum = lumAt[i / 4] * ramp(Math.floor(i / 4 / w))
    px[i] = r; px[i + 1] = gr; px[i + 2] = b
    px[i + 3] = Math.round(255 * Math.min(1, lum * 1.15))
  }
  g.putImageData(data, 0, 0)
  // a mirrored copy, so tiles can alternate and the joins match
  const m = document.createElement('canvas')
  m.width = c.width
  m.height = c.height
  const mg = m.getContext('2d')
  mg.translate(c.width, 0)
  mg.scale(-1, 1)
  mg.drawImage(c, 0, 0)
  return [c, m]
}

export default function Fog({ ground: groundDefault = 0.72, floor = null, stage = null,
                              layer = 'front', className = '' }) {
  const ref = useRef(null)

  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return undefined
    const ctx = canvas.getContext('2d')
    if (!ctx) return undefined
    const colour = getComputedStyle(canvas).getPropertyValue('--sw-dusk-fog').trim() || '220 228 220'
    const SCALE = 0.6
    let W = 1; let H = 1
    let ground = groundDefault
    let span = 60
    let trunkX = 0.5; let stageW = 600
    let tiles = null
    let raf = 0; let last = 0; let t = 0; let running = false; let visible = true
    let pageVisible = !document.hidden
    let fadeIn = 0
    const reduced = prefersReducedMotion()

    const measure = () => {
      const r = canvas.getBoundingClientRect()
      W = Math.max(1, r.width); H = Math.max(1, r.height)
      const el = floor && canvas.parentElement?.querySelector(floor)
      if (el) ground = Math.min(0.95, Math.max(0.3, (el.getBoundingClientRect().top - r.top) / H))
      trunkX = W / 2
      const st = stage && canvas.parentElement?.querySelector(stage)
      if (st) {
        const sr = st.getBoundingClientRect()
        span = Math.max(24, (el ? el.getBoundingClientRect().top - sr.top : sr.height * 0.7) / 6)
        trunkX = sr.left - r.left + sr.width / 2
        stageW = sr.width
      } else {
        span = H * 0.08
      }
      canvas.width = Math.round(W * SCALE)
      canvas.height = Math.round(H * SCALE)
      ctx.setTransform(SCALE, 0, 0, SCALE, 0, 0)
    }

    // one strip of mirrored tiles, scrolled left by `offset` px
    const strip = (sx, sy, sw, sh, dy, dh, offset, alpha) => {
      const [a, b] = tiles
      const dw = dh * (sw / sh)
      const period = dw * 2
      let x = -(offset % period)
      let i = 0
      ctx.globalAlpha = alpha
      while (x < W) {
        if (x + dw > 0) ctx.drawImage(i % 2 ? b : a, i % 2 ? a.width - sx - sw : sx, sy, sw, sh, x, dy, dw + 1, dh) // 1px overlap: no hairline at the joins
        x += dw
        i += 1
      }
    }

    const draw = () => {
      ctx.clearRect(0, 0, W, H)
      if (!tiles) return
      const [a] = tiles
      const iw = a.width; const ih = a.height
      const gy = H * ground
      const k = Math.min(1, fadeIn)
      // the band: its bright core on the ground line, a sixth of the tree tall
      const bandH = span * 4.2
      const bandTop = gy - bandH * BAND_CORE
      const speed = (stageW / 600) * 14 // px a second
      if (layer === 'back') {
        strip(0, 0, iw, ih, bandTop, bandH, t * speed, 0.9 * k)
        ctx.globalAlpha = 1
        return
      }
      // the sea below: bigger, dimmer, nearer, so it moves faster
      const seaTop = gy + span * 0.3
      const seaH = Math.max(H - seaTop, span) * 1.25
      strip(0, ih * SEA_FROM, iw, ih * (1 - SEA_FROM), seaTop, seaH, t * speed * 1.7 + 400, 0.55 * k)
      // feather the sea's top so it melts into the band instead of starting
      // on a straight line
      ctx.globalAlpha = 1
      ctx.globalCompositeOperation = 'destination-out'
      const fh = seaH * 0.3
      const fg = ctx.createLinearGradient(0, seaTop, 0, seaTop + fh)
      fg.addColorStop(0, 'rgb(0 0 0 / 1)')
      fg.addColorStop(1, 'rgb(0 0 0 / 0)')
      ctx.fillStyle = fg
      ctx.fillRect(0, seaTop - 1, W, fh + 1)
      ctx.globalCompositeOperation = 'source-over'
      strip(0, 0, iw, ih, bandTop, bandH, t * speed, 0.85 * k)
      // thinner in front of the trunk, so the tree stays readable
      ctx.globalAlpha = 1
      ctx.globalCompositeOperation = 'destination-out'
      const rx = Math.max(40, stageW * 0.12)
      const g = ctx.createRadialGradient(trunkX, gy - span * 0.4, 0, trunkX, gy - span * 0.4, rx)
      g.addColorStop(0, 'rgb(0 0 0 / 0.45)')
      g.addColorStop(1, 'rgb(0 0 0 / 0)')
      ctx.fillStyle = g
      ctx.fillRect(trunkX - rx, gy - span * 0.4 - rx, rx * 2, rx * 2)
      ctx.globalCompositeOperation = 'source-over'
    }

    const frame = (now) => {
      const dt = Math.min(0.05, (now - last) / 1000 || 0)
      last = now
      t += dt
      if (fadeIn < 1) fadeIn += dt / 1.2
      draw()
      raf = requestAnimationFrame(frame)
    }
    const start = () => {
      if (running || reduced || !visible || !pageVisible || !tiles) return
      running = true
      last = performance.now()
      raf = requestAnimationFrame(frame)
    }
    const stop = () => { running = false; cancelAnimationFrame(raf) }

    measure()
    const img = new Image()
    img.decoding = 'async'
    img.onload = () => {
      tiles = tint(img, colour)
      if (reduced) fadeIn = 1
      draw()
      start()
    }
    img.src = SRC
    const ro = new ResizeObserver(() => { measure(); draw() })
    ro.observe(canvas)
    const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; if (visible) start(); else stop() })
    io.observe(canvas)
    const onVis = () => { pageVisible = !document.hidden; if (pageVisible) start(); else stop() }
    document.addEventListener('visibilitychange', onVis)
    return () => {
      stop()
      img.onload = null
      ro.disconnect()
      io.disconnect()
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [groundDefault, floor, stage, layer])

  return <canvas ref={ref} className={`fog ${className}`.trim()} aria-hidden="true" />
}
