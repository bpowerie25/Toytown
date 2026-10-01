import type { Map as MaplibreMap } from 'maplibre-gl';
import type { EffectsTheme } from '../themes';

/**
 * Theme effects drawn as DOM overlays above the map canvas (below the controls), so they cover
 * the base map and the 3D layer alike: paper grain, horizon haze and falling snow. Halftone and
 * wobble are in the building and model shaders instead (see `toon.ts`).
 */
export class EffectsOverlay {
  private paper?: HTMLElement;
  private haze?: HTMLElement;
  private snow?: Snowfall;
  private effects: EffectsTheme = {};
  private readonly onPitch = () => this.updateHaze();

  constructor(private readonly map: MaplibreMap) {
    map.on('pitch', this.onPitch);
  }

  /** Show the given effects (an empty object or undefined turns them all off). */
  set(effects: EffectsTheme | undefined): void {
    this.effects = effects ?? {};
    const { paper, haze, snow } = this.effects;

    if (paper) {
      const el = (this.paper ??= this.layer('toytown-paper', {
        backgroundImage: `url(${grainTile()})`,
        mixBlendMode: 'multiply',
      }));
      el.style.opacity = String(paper);
    } else this.paper = drop(this.paper);

    if (haze) {
      const el = (this.haze ??= this.layer('toytown-haze', {}));
      el.style.background = `linear-gradient(to bottom, ${haze.color} 0%, ${haze.color}00 55%)`;
      this.updateHaze();
    } else this.haze = drop(this.haze);

    const reduceMotion =
      typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (snow && !reduceMotion) {
      this.snow ??= new Snowfall(this.layer('toytown-snow', {}, 'canvas') as HTMLCanvasElement);
      this.snow.density = snow.density;
    } else {
      this.snow?.stop();
      this.snow = undefined;
    }
  }

  remove(): void {
    this.set(undefined);
    this.map.off('pitch', this.onPitch);
  }

  /** Haze needs a horizon: none looking straight down, full from about 65° of pitch. */
  private updateHaze() {
    if (!this.haze || !this.effects.haze) return;
    const t = Math.min(1, Math.max(0, (this.map.getPitch() - 20) / 45));
    this.haze.style.opacity = String(this.effects.haze.amount * t);
  }

  private layer(name: string, style: Partial<CSSStyleDeclaration>, tag = 'div'): HTMLElement {
    const el = document.createElement(tag);
    el.className = name;
    Object.assign(el.style, {
      position: 'absolute',
      inset: '0',
      width: '100%',
      height: '100%',
      pointerEvents: 'none',
      ...style,
    });
    const container = this.map.getContainer();
    container.insertBefore(el, container.querySelector('.maplibregl-control-container'));
    return el;
  }
}

function drop<T extends HTMLElement>(el: T | undefined): undefined {
  el?.remove();
  return undefined;
}

let grain: string | undefined;
/** A small tileable paper-grain texture (light speckle and faint fibres), made once. */
function grainTile(): string {
  if (grain) return grain;
  const size = 160;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  const img = g.createImageData(size, size);
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
  for (let i = 0; i < size * size; i++) {
    const v = 255 - Math.floor(rnd() * rnd() * 70);
    img.data.set([v, v - 3, v - 8, 255], i * 4);
  }
  g.putImageData(img, 0, 0);
  g.strokeStyle = 'rgba(120, 100, 70, 0.08)';
  for (let i = 0; i < 40; i++) {
    const x = rnd() * size;
    const y = rnd() * size;
    const a = rnd() * Math.PI;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + Math.cos(a) * 14, y + Math.sin(a) * 14);
    g.stroke();
  }
  return (grain = c.toDataURL());
}

/** Falling snow on a 2D canvas. Animates only while it exists; the browser pauses hidden tabs. */
class Snowfall {
  density = 0.5;
  private flakes: { x: number; y: number; r: number; v: number; phase: number }[] = [];
  private frame = 0;
  private last = 0;

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.frame = requestAnimationFrame((t) => this.tick(t));
  }

  stop() {
    cancelAnimationFrame(this.frame);
    this.canvas.remove();
  }

  private tick(now: number) {
    const dt = Math.min(0.05, (now - (this.last || now)) / 1000);
    this.last = now;
    const c = this.canvas;
    const dpr = devicePixelRatio || 1;
    const w = c.clientWidth;
    const h = c.clientHeight;
    if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) {
      c.width = Math.round(w * dpr);
      c.height = Math.round(h * dpr);
    }
    const want = Math.round(((w * h) / 2500) * this.density);
    while (this.flakes.length < want)
      this.flakes.push({
        x: Math.random() * w,
        y: Math.random() * h,
        r: 1 + Math.random() * 2.2,
        v: 25 + Math.random() * 45,
        phase: Math.random() * 6.3,
      });
    this.flakes.length = Math.min(this.flakes.length, want);

    const g = c.getContext('2d')!;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, h);
    g.fillStyle = 'rgba(255, 255, 255, 0.9)';
    g.beginPath();
    for (const f of this.flakes) {
      f.y += f.v * dt * (f.r / 2);
      f.x += Math.sin(now / 900 + f.phase) * 12 * dt;
      if (f.y > h + 4) [f.y, f.x] = [-4, Math.random() * w];
      g.moveTo(f.x + f.r, f.y);
      g.arc(f.x, f.y, f.r, 0, Math.PI * 2);
    }
    g.fill();
    this.frame = requestAnimationFrame((t) => this.tick(t));
  }
}
