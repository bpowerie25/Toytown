import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import { THEMES, ToyTown, VERSION, type ToyTownClickEvent } from 'toytown-gl';
import type { Landmark } from './landmarks';
import './demo.css';

// MapLibre 6 can't find its worker inside a bundle; Vite gives it a URL.
maplibregl.setWorkerUrl(workerUrl);

export interface DemoOptions {
  title: string;
  data: string;
  center: [number, number];
  landmarks: Landmark[];
  other: { title: string; href: string };
}

const escape = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const pretty = (category: string) => category.replace(/_/g, ' ').replace(/^landmark /, '');

/** Skins with a dark background, which get the dark panel. */
const DARK = new Set(['night', 'neon', 'blueprint', 'halloween']);

/** The skins in the picker: theme name and label. */
const SKINS: [string, string][] = [
  ['default', 'Day'],
  ['night', 'Night'],
  ['sitcom', 'Sitcom'],
  ['pastel', 'Pastel'],
  ['toybox', 'Toybox'],
  ['voxel', 'Voxel'],
  ['chunky', 'Chunky'],
  ['retro', 'Retro handheld'],
  ['neon', 'Neon'],
  ['vintage', 'Vintage'],
  ['sketch', 'Ink sketch'],
  ['handdrawn', 'Hand-drawn'],
  ['comic', 'Comic'],
  ['blueprint', 'Blueprint'],
  ['golden', 'Golden hour'],
  ['autumn', 'Autumn'],
  ['winter', 'Winter'],
  ['christmas', 'Christmas'],
  ['halloween', 'Halloween'],
  ['shamrock', 'Shamrock'],
];

/** A full-screen toy-town demo: map, landmark fly-to panel, skin picker and click popups. */
export function startDemo(o: DemoOptions): { map: maplibregl.Map; toy: ToyTown } {
  const params = new URLSearchParams(location.search);
  let theme = THEMES[params.get('theme') ?? ''] ? params.get('theme')! : 'default';
  const paint = () => {
    document.body.classList.toggle('night', DARK.has(theme));
    document.body.style.background = THEMES[theme]!.style.land!;
  };
  paint();

  const map = new maplibregl.Map({
    container: 'map',
    style: ToyTown.style({ theme }),
    center: o.center,
    zoom: 16.2,
    pitch: 55,
    attributionControl: { compact: false },
  });
  map.addControl(new maplibregl.NavigationControl(), 'top-right');

  const toy = new ToyTown({
    data: o.data,
    models: './models/manifest.json',
    theme,
    debug: params.has('debug'),
  });
  toy.addTo(map);

  // Click a building, model or tree: popup with its category and a link to OpenStreetMap.
  const popup = new maplibregl.Popup({ closeButton: true, maxWidth: '260px' });
  toy.on('click', (e: ToyTownClickEvent) => {
    const lines = [
      `<strong>${escape(e.name ?? pretty(e.category))}</strong>`,
      `${escape(pretty(e.category))}${e.height ? ` · ${Math.round(e.height)} m` : ''}`,
      e.osm
        ? `<a href="${e.osm}" target="_blank" rel="noopener">View on OpenStreetMap</a>`
        : 'Scattered park tree',
    ];
    popup.setLngLat(e.lngLat).setHTML(lines.join('<br>')).addTo(map);
  });
  // Pointer cursor over clickable things. Picking raycasts the visible chunks, so do it at most
  // once a frame, and not while the map is moving.
  let hover: { x: number; y: number } | null = null;
  map.on('mousemove', (e) => {
    if (!hover)
      requestAnimationFrame(() => {
        if (hover && !map.isMoving())
          map.getCanvas().style.cursor = toy.pick(hover) ? 'pointer' : '';
        hover = null;
      });
    hover = e.point;
  });

  // Fly-to panel, with the skin picker.
  const panel = document.createElement('div');
  panel.className = 'panel';
  const query = () => (theme === 'default' ? '' : `?theme=${theme}`);
  panel.innerHTML = `<h1>${escape(o.title)}</h1>
    ${o.landmarks.map((l, i) => `<button data-i="${i}">${escape(l.name)}</button>`).join('')}
    <label class="skins">Skin <select aria-label="Skin">${SKINS.map(
      ([name, label]) =>
        `<option value="${name}"${name === theme ? ' selected' : ''}>${label}</option>`,
    ).join('')}</select></label>
    <div class="links"><a class="other" href="${o.other.href}${query()}">${escape(o.other.title)} →</a></div>`;
  panel.querySelector('select')!.addEventListener('change', (ev) => {
    // Switch live: no reload, the map keeps its view.
    theme = (ev.target as HTMLSelectElement).value;
    paint();
    void toy.setTheme(theme);
    history.replaceState(null, '', `${location.pathname}${query()}`);
    panel.querySelector<HTMLAnchorElement>('a.other')!.href = `${o.other.href}${query()}`;
  });
  panel.addEventListener('click', (ev) => {
    const target = ev.target as HTMLElement;
    const i = target.dataset.i;
    if (i === undefined) return;
    const l = o.landmarks[Number(i)]!;
    popup.remove();
    map.flyTo({
      center: l.center,
      zoom: l.zoom,
      pitch: 60,
      bearing: l.bearing,
      duration: 4000,
      essential: true,
    });
  });
  document.body.appendChild(panel);

  console.info(`toytown-gl ${VERSION}: ${o.title} demo`);
  return { map, toy };
}
