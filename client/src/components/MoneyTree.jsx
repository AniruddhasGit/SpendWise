import { useEffect, useRef } from 'react'
import { rupees } from '../lib/money.js'
import { prefersReducedMotion } from '../lib/motion.js'

/**
 * The money tree (SW-ADR-156): a poster-print bonsai whose leaves are banknotes.
 *
 * The tree is ONE still image (`/assets/tree/money-tree.webp`, provenance beside
 * it). Everything alive is drawn here: bills detach from the painted leaves and
 * flutter down to a frosted glass ground, where the roots fade out. On the
 * landing page a breeze passes now and then, mist drifts across the ground and
 * the poster's orbit lines circle the canopy.
 *
 * Interaction: brushing the pointer across the canopy shakes bills loose. A new
 * `dropRequest` (`{ id, label, paise }`) drops one bill carrying exactly that
 * label and amount; the dashboard sends one after the server confirms an
 * expense. The bills are canvas pixels, never DOM text, so no figure a test or a
 * screen reader reads is ever mid-animation. Reduced motion draws nothing.
 */

const TREE_SRC = '/assets/tree/money-tree.webp'

// The painted banknotes, located in the image (x, y as fractions of its box).
// Measured from the artwork, so a falling bill leaves from where a leaf is.
const LEAVES = [
  [0.58, 0.08], [0.51, 0.09], [0.64, 0.09], [0.51, 0.1], [0.62, 0.1], [0.73, 0.12],
  [0.45, 0.13], [0.38, 0.13], [0.64, 0.14], [0.43, 0.14], [0.52, 0.17], [0.78, 0.17],
  [0.63, 0.18], [0.79, 0.18], [0.5, 0.18], [0.68, 0.19], [0.26, 0.22], [0.84, 0.22],
  [0.74, 0.23], [0.83, 0.24], [0.49, 0.25], [0.36, 0.25], [0.41, 0.26], [0.69, 0.26],
  [0.71, 0.27], [0.32, 0.27], [0.8, 0.28], [0.53, 0.28], [0.87, 0.29], [0.27, 0.3],
  [0.58, 0.31], [0.66, 0.31], [0.4, 0.33], [0.69, 0.34], [0.57, 0.34], [0.47, 0.35],
  [0.61, 0.35], [0.84, 0.36], [0.38, 0.36], [0.43, 0.37], [0.83, 0.37], [0.14, 0.38],
  [0.44, 0.38], [0.75, 0.39], [0.4, 0.39], [0.2, 0.4], [0.92, 0.4], [0.32, 0.4],
  [0.35, 0.4], [0.69, 0.41], [0.48, 0.42], [0.91, 0.42], [0.22, 0.42], [0.67, 0.42],
  [0.46, 0.43], [0.25, 0.44], [0.88, 0.45], [0.83, 0.45], [0.59, 0.46], [0.9, 0.47],
  [0.8, 0.47], [0.53, 0.48], [0.12, 0.48], [0.3, 0.49], [0.52, 0.5], [0.77, 0.5],
  [0.51, 0.51], [0.49, 0.52], [0.14, 0.53], [0.11, 0.56], [0.1, 0.58],
]
const GROUND = 0.735        // where the trunk meets the roots, as a fraction of the image height
const CANOPY_BOTTOM = 0.6   // brushing below this does not shake bills

// Examples for the landing page, and for a dashboard with nothing logged yet.
// Illustrative spends, not claims about anyone's money.
export const EXAMPLE_BILLS = [
  { label: 'Pizza', paise: 34900 }, { label: 'Chai', paise: 2000 },
  { label: 'Auto', paise: 8000 }, { label: 'Groceries', paise: 124000 },
  { label: 'Rent', paise: 1800000 }, { label: 'Movie', paise: 45000 },
  { label: 'Petrol', paise: 50000 }, { label: 'Books', paise: 89900 },
  { label: 'Electricity', paise: 214000 }, { label: 'Biryani', paise: 28000 },
  { label: 'Gym', paise: 150000 }, { label: 'Metro', paise: 6000 },
]

/** A falling bill's size follows its amount on a fixed four-step ramp. */
function sizeFor(paise) {
  if (paise >= 500000) return 1.3
  if (paise >= 100000) return 1.15
  if (paise >= 20000) return 1
  return 0.86
}

/** `rupees()` is the only formatter; a bill just drops a zero fraction. */
function amountText(paise) {
  const s = rupees(paise)
  return s && s.endsWith('.00') ? s.slice(0, -3) : s
}

function readPalette(el) {
  const cs = getComputedStyle(el)
  const v = (name, fallback) => cs.getPropertyValue(name).trim() || fallback
  // The fallbacks only cover a stylesheet that has not loaded yet.
  return {
    ink: v('--sw-brand-vermilion', 'rgb(227 66 34)'),
    inkDeep: v('--sw-brand-vermilion-deep', 'rgb(179 48 26)'),
    shadow: v('--mt-bill-shadow', 'rgb(11 42 28 / 0.18)'),
  }
}

// The bill itself is PRINTED, not drawn: two sprites rendered in the tree's
// risograph language (grain, guilloche, a halftone oval, the vermilion
// misregistration edge). Provenance beside each file. Canvas only writes the
// category and the amount on the front's clear band.
const SPRITES = { front: '/assets/tree/bill-front.webp', back: '/assets/tree/bill-back.webp' }
const BILL_W = 62
const BILL_H = 32

function loadSprites() {
  const out = {}
  for (const [k, src] of Object.entries(SPRITES)) {
    const im = new Image()
    im.decoding = 'async'
    im.src = src
    out[k] = im
  }
  return out
}

function drawBill(ctx, b, pal, sprites) {
  const w = BILL_W * b.size
  const h = BILL_H * b.size
  ctx.save()
  ctx.globalAlpha = b.alpha
  ctx.translate(b.x, b.y)
  ctx.rotate(b.rot)
  // The paper tumbling: a cosine on one axis reads as a sheet turning over.
  // Never thinner than a third, so an edge-on bill never becomes a sliver.
  const flip = Math.cos(b.phase)
  ctx.scale(1, Math.max(0.35, Math.abs(flip)) * Math.sign(flip || 1))
  const front = flip >= 0
  const sprite = front ? sprites.front : sprites.back

  ctx.shadowColor = pal.shadow
  ctx.shadowBlur = 7 * b.size
  ctx.shadowOffsetY = 2.5 * b.size
  if (sprite.complete && sprite.naturalWidth) ctx.drawImage(sprite, -w / 2, -h / 2, w, h)
  ctx.shadowColor = 'transparent'

  if (front) {
    // the writing, in the clear band right of the oval: what, and how much
    const left = -w / 2 + w * 0.47
    const room = w * 0.47
    ctx.textBaseline = 'alphabetic'
    ctx.textAlign = 'left'
    ctx.fillStyle = pal.inkDeep
    ctx.font = `700 ${Math.max(8, 7.5 * b.size)}px Geist, system-ui, sans-serif`
    ctx.fillText(b.label, left, -h / 2 + h * 0.4, room)
    ctx.fillStyle = pal.ink
    ctx.font = `900 ${Math.max(13, 14 * b.size)}px "Big Shoulders Display", Geist, system-ui, sans-serif`
    ctx.fillText(b.amount, left, h / 2 - h * 0.2, room)
  }
  ctx.restore()
}

/** The poster's four-point spark, for the burst where a new bill lands. */
function drawSpark(ctx, s, colour) {
  const r = s.r
  ctx.save()
  ctx.globalAlpha = s.alpha
  ctx.translate(s.x, s.y)
  ctx.rotate(s.rot)
  ctx.fillStyle = colour
  ctx.beginPath()
  ctx.moveTo(0, -r)
  ctx.lineTo(r * 0.18, -r * 0.18)
  ctx.lineTo(r, 0)
  ctx.lineTo(r * 0.18, r * 0.18)
  ctx.lineTo(0, r)
  ctx.lineTo(-r * 0.18, r * 0.18)
  ctx.lineTo(-r, 0)
  ctx.lineTo(-r * 0.18, -r * 0.18)
  ctx.closePath()
  ctx.fill()
  ctx.restore()
}

export default function MoneyTree({
  bills, variant = 'dashboard', atmosphere = false, orbits = atmosphere, dropRequest = null,
  alt = 'A bonsai tree whose leaves are banknotes', className = '',
}) {
  const rootRef = useRef(null)
  const imgRef = useRef(null)
  const canvasRef = useRef(null)
  const api = useRef(null)
  const feedRef = useRef(bills)
  feedRef.current = bills && bills.length ? bills : EXAMPLE_BILLS

  useEffect(() => {
    const root = rootRef.current
    const canvas = canvasRef.current
    const img = imgRef.current
    if (!root || !canvas || !img) return undefined
    const ctx = canvas.getContext('2d')
    if (!ctx) return undefined

    let reduced = prefersReducedMotion()
    let pal = readPalette(root)
    const sprites = loadSprites()
    const sparks = []
    let W = 0; let H = 0; let box = { x: 0, y: 0, w: 1, h: 1 }
    let raf = 0; let last = 0; let running = false; let visible = true
    let pageVisible = !document.hidden
    let spawnClock = 0; let feedIndex = 0
    let wind = 0; let gust = null; let nextGust = 6 + Math.random() * 5
    const live = []
    const MAX = variant === 'landing' ? 30 : 18
    const every = variant === 'landing' ? 1.9 : 3.4

    const measure = () => {
      const r = root.getBoundingClientRect()
      const ir = img.getBoundingClientRect()
      W = Math.max(1, r.width); H = Math.max(1, r.height)
      box = { x: ir.left - r.left, y: ir.top - r.top, w: Math.max(1, ir.width), h: Math.max(1, ir.height) }
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      canvas.width = Math.round(W * dpr)
      canvas.height = Math.round(H * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }

    const nextItem = () => {
      const feed = feedRef.current
      const item = feed[feedIndex % feed.length]
      feedIndex += 1
      return item
    }

    const spawn = ({ x, y, item, featured = false, push = 0 }) => {
      if (live.length >= MAX && !featured) return
      const size = featured ? 2.2 : sizeFor(item.paise)
      live.push({
        x, y, size, featured,
        label: String(item.label || 'Uncategorised').slice(0, 18),
        amount: amountText(item.paise) || '',
        vx: push + (Math.random() - 0.5) * 14,
        vy: featured ? 4 : 8 + Math.random() * 10,
        rot: (Math.random() - 0.5) * 0.9,
        spin: (Math.random() - 0.5) * 0.6,
        phase: Math.random() * Math.PI * 2,
        flipRate: 1.6 + Math.random() * 2.2,
        swayAmp: 18 + Math.random() * 22,
        swayFreq: 1.1 + Math.random() * 1.3,
        t: 0, alpha: 0, settled: 0,
      })
    }

    const leafPoint = (near) => {
      let pick = LEAVES[Math.floor(Math.random() * LEAVES.length)]
      if (near) {
        let best = Infinity
        for (const p of LEAVES) {
          const dx = box.x + p[0] * box.w - near.x
          const dy = box.y + p[1] * box.h - near.y
          const d = dx * dx + dy * dy + Math.random() * 400
          if (d < best) { best = d; pick = p }
        }
      }
      return { x: box.x + pick[0] * box.w, y: box.y + pick[1] * box.h }
    }

    const groundY = () => box.y + GROUND * box.h

    const step = (dt) => {
      // the breeze: a gust swells, peaks and dies away; it sways the tree and
      // carries loose bills sideways before they fall
      if (atmosphere) {
        nextGust -= dt
        if (!gust && nextGust <= 0) {
          gust = { t: 0, len: 2.6 + Math.random() * 1.4, peak: (Math.random() < 0.5 ? -1 : 1) * (70 + Math.random() * 50) }
          for (let i = 0; i < 3; i += 1) {
            const p = leafPoint()
            spawn({ ...p, item: nextItem(), push: gust.peak * 0.4 })
          }
        }
        if (gust) {
          gust.t += dt
          const k = gust.t / gust.len
          wind = gust.peak * Math.sin(Math.min(1, k) * Math.PI)
          if (k >= 1) { gust = null; wind = 0; nextGust = 7 + Math.random() * 6 }
        }
        img.style.setProperty('--mt-sway', `${(wind / 120) * 1.1}deg`)
      }

      spawnClock += dt
      if (spawnClock >= every) {
        spawnClock = 0
        spawn({ ...leafPoint(), item: nextItem() })
      }

      for (let i = sparks.length - 1; i >= 0; i -= 1) {
        const p = sparks[i]
        p.t += dt
        p.x += p.vx * dt
        p.y += p.vy * dt
        p.vy += 60 * dt
        p.rot += dt * 2
        p.alpha = Math.max(0, 1 - p.t / 0.9)
        if (p.alpha <= 0) sparks.splice(i, 1)
      }

      const floor = groundY()
      for (let i = live.length - 1; i >= 0; i -= 1) {
        const b = live[i]
        b.t += dt
        if (b.settled) {
          b.settled += dt
          b.alpha = Math.max(0, Math.min(1, 1 - (b.settled - (b.featured ? 2.2 : 0.4)) / 0.9))
          if (b.alpha <= 0) live.splice(i, 1)
          continue
        }
        b.alpha = Math.min(1, b.alpha + dt * 4)
        b.vy = Math.min(b.featured ? 38 : 52, b.vy + 40 * dt)
        b.vx += (wind - b.vx) * 1.4 * dt
        b.x += (b.vx + Math.sin(b.t * b.swayFreq) * b.swayAmp) * dt
        b.y += b.vy * dt
        b.rot += b.spin * dt + Math.sin(b.t * b.swayFreq) * 0.4 * dt
        b.phase += b.flipRate * dt
        if (b.y >= floor - 6 * b.size) {
          b.y = floor - 6 * b.size
          b.settled = 0.0001
          b.phase = 0
          b.rot *= 0.4
          if (b.featured) {
            // the landing of a just-logged expense: a burst of poster sparks
            for (let k = 0; k < 7; k += 1) {
              const a = (k / 7) * Math.PI * 2 + Math.random() * 0.4
              sparks.push({ x: b.x, y: b.y, vx: Math.cos(a) * (60 + Math.random() * 60),
                            vy: Math.sin(a) * (40 + Math.random() * 40) - 30,
                            r: 5 + Math.random() * 6, rot: Math.random(), t: 0, alpha: 1 })
            }
          }
        }
        if (b.x < -80 || b.x > W + 80) live.splice(i, 1)
      }
    }

    const draw = () => {
      ctx.clearRect(0, 0, W, H)
      for (const b of live) drawBill(ctx, b, pal, sprites)
      for (const p of sparks) drawSpark(ctx, p, pal.ink)
    }

    const frame = (now) => {
      const dt = Math.min(0.05, (now - last) / 1000 || 0)
      last = now
      step(dt)
      draw()
      raf = requestAnimationFrame(frame)
    }

    const start = () => {
      if (running || reduced || !visible || !pageVisible) return
      running = true
      last = performance.now()
      raf = requestAnimationFrame(frame)
    }
    const stop = () => {
      running = false
      cancelAnimationFrame(raf)
    }

    measure()
    const ro = new ResizeObserver(() => { measure(); if (!running) draw() })
    ro.observe(root)
    img.addEventListener('load', measure)

    const io = new IntersectionObserver(([e]) => {
      visible = e.isIntersecting
      if (visible) start(); else stop()
    })
    io.observe(root)

    const onVis = () => { pageVisible = !document.hidden; if (pageVisible) start(); else stop() }
    document.addEventListener('visibilitychange', onVis)

    // Theme and motion preferences can change while the tree is on screen.
    const motionMq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const onMotion = () => {
      reduced = prefersReducedMotion()
      if (reduced) { stop(); live.length = 0; ctx.clearRect(0, 0, W, H) } else start()
    }
    motionMq.addEventListener?.('change', onMotion)
    const themeMo = new MutationObserver(() => { pal = readPalette(root) })
    themeMo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    const schemeMq = window.matchMedia('(prefers-color-scheme: dark)')
    const onScheme = () => { pal = readPalette(root) }
    schemeMq.addEventListener?.('change', onScheme)

    // Brushing the canopy shakes bills loose, from the leaves nearest the pointer.
    let lastPt = null; let travelled = 0
    const onMove = (e) => {
      if (reduced) return
      const r = root.getBoundingClientRect()
      const pt = { x: e.clientX - r.left, y: e.clientY - r.top }
      const inCanopy = pt.x >= box.x && pt.x <= box.x + box.w
        && pt.y >= box.y && pt.y <= box.y + CANOPY_BOTTOM * box.h
      if (lastPt && inCanopy) {
        const dx = pt.x - lastPt.x
        travelled += Math.hypot(dx, pt.y - lastPt.y)
        if (travelled > 60) {
          travelled = 0
          spawn({ ...leafPoint(pt), item: nextItem(), push: Math.max(-60, Math.min(60, dx * 3)) })
        }
      }
      lastPt = pt
    }
    const onLeave = () => { lastPt = null; travelled = 0 }
    root.addEventListener('pointermove', onMove)
    root.addEventListener('pointerleave', onLeave)

    // Fonts first, or the first bills are written in the fallback face.
    document.fonts?.ready.then(() => { if (!running) draw() })

    api.current = {
      drop(item) {
        if (reduced) return
        const p = leafPoint({ x: box.x + box.w * 0.5, y: box.y })
        spawn({ ...p, item, featured: true })
        start()
      },
    }
    start()

    return () => {
      stop()
      ro.disconnect()
      io.disconnect()
      themeMo.disconnect()
      img.removeEventListener('load', measure)
      document.removeEventListener('visibilitychange', onVis)
      motionMq.removeEventListener?.('change', onMotion)
      schemeMq.removeEventListener?.('change', onScheme)
      root.removeEventListener('pointermove', onMove)
      root.removeEventListener('pointerleave', onLeave)
      api.current = null
    }
  }, [variant, atmosphere])

  // A drop request is played once, even if it arrived before the tree mounted.
  const played = useRef(null)
  useEffect(() => {
    if (!dropRequest || played.current === dropRequest.id) return
    played.current = dropRequest.id
    // after the mount effect has set the canvas up
    const id = requestAnimationFrame(() => api.current?.drop(dropRequest))
    return () => cancelAnimationFrame(id)
  }, [dropRequest])

  return (
    <div ref={rootRef} className={`mt mt-${variant}${atmosphere ? ' mt-atmos' : ''} ${className}`.trim()}>
      {orbits && (
        <svg className="mt-orbits" viewBox="0 0 1000 1000" aria-hidden="true" focusable="false">
          <g className="mt-orbit mt-orbit-a">
            <ellipse cx="500" cy="380" rx="470" ry="150" />
          </g>
          <g className="mt-orbit mt-orbit-b">
            <ellipse cx="500" cy="380" rx="430" ry="210" strokeDasharray="2 10" />
          </g>
          {[[150, 230, 0], [830, 250, 1], [740, 110, 2], [230, 540, 3]].map(([x, y, i]) => (
            <path key={i} className={`mt-spark mt-spark-${i}`}
                  d={`M${x} ${y - 22}L${x + 4} ${y - 4}L${x + 22} ${y}L${x + 4} ${y + 4}L${x} ${y + 22}L${x - 4} ${y + 4}L${x - 22} ${y}L${x - 4} ${y - 4}Z`} />
          ))}
        </svg>
      )}
      <div className="mt-stage">
        <img ref={imgRef} className="mt-tree" src={TREE_SRC} alt={alt}
             width="1200" height="1200" decoding="async"
             fetchPriority={variant === 'landing' ? 'high' : 'auto'} draggable="false" />
        <div className="mt-ground" aria-hidden="true" />
        {atmosphere && (
          <div className="mt-mist" aria-hidden="true">
            <span className="mt-mist-a" /><span className="mt-mist-b" /><span className="mt-mist-c" />
          </div>
        )}
      </div>
      <canvas ref={canvasRef} className="mt-bills" aria-hidden="true" />
    </div>
  )
}
