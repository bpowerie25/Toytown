import type { Map as MaplibreMap } from 'maplibre-gl';

interface OverlayStats {
  level: number;
  drawing: boolean;
  chunks: { total: number; ready: number; visible: number };
  visibleInstances: number;
  calls: number;
  triangles: number;
  renderMs: number;
}

const LEVELS = ['base only', 'plain', 'full', 'full + models'];

/**
 * A small FPS / draw-call panel in the map's corner, for `new ToyTown({ debug: true })`.
 * FPS counts MapLibre frames over the last second (the map only redraws while something moves).
 */
export class DebugOverlay {
  private readonly el: HTMLDivElement;
  private frames: number[] = [];
  private lastPaint = 0;
  private readonly onRender = () => this.tick();

  constructor(
    private readonly map: MaplibreMap,
    private readonly stats: () => OverlayStats | undefined,
  ) {
    this.el = document.createElement('div');
    this.el.className = 'toytown-debug';
    Object.assign(this.el.style, {
      position: 'absolute',
      left: '8px',
      top: '8px',
      zIndex: '2',
      padding: '6px 8px',
      font: '11px/1.35 ui-monospace, SFMono-Regular, Menlo, monospace',
      color: '#FFFFFF',
      background: 'rgba(43, 45, 66, 0.82)', // #2B2D42
      borderRadius: '6px',
      pointerEvents: 'none',
      whiteSpace: 'pre',
    });
    map.getContainer().appendChild(this.el);
    map.on('render', this.onRender);
    this.tick();
  }

  private tick() {
    const now = performance.now();
    this.frames.push(now);
    while (this.frames.length && now - this.frames[0]! > 1000) this.frames.shift();
    if (now - this.lastPaint < 250) return;
    this.lastPaint = now;
    const s = this.stats();
    const lines = [`fps ${this.frames.length}  zoom ${this.map.getZoom().toFixed(2)}`];
    if (s) {
      lines.push(
        `lod ${s.drawing ? LEVELS[s.level] : 'off (globe)'}`,
        `draws ${s.calls}  tris ${(s.triangles / 1e3).toFixed(0)}k`,
        `chunks ${s.chunks.visible} visible, ${s.chunks.ready}/${s.chunks.total} loaded`,
        `instances ${s.visibleInstances}  layer ${s.renderMs.toFixed(2)} ms`,
      );
    }
    this.el.textContent = lines.join('\n');
  }

  remove() {
    this.map.off('render', this.onRender);
    this.el.remove();
  }
}
