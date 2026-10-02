import * as maplibregl from 'maplibre-gl';
import type { ToyTownClickEvent } from 'toytown-gl';
import './pois.css';

/**
 * Points of interest: numbered pins, highlighted footprints, a popup with the story and a tour
 * list. Driven entirely by a GeoJSON file of points (e.g. examples/castlemagner/public/data/pois.geojson), so nothing
 * here is specific to one town. Turned on with `startDemo({ pois })`.
 */
export interface PoiProperties {
  id: string;
  title: string;
  /** Short label under the title: "Tower house", "Holy well"… */
  kind: string;
  /** Pin colour: `history`, `faith`, `community` or anything else (grey). */
  group?: string;
  period?: string;
  /** Paragraphs of plain text. */
  text: string[];
  /** The OSM element it belongs to: clicking that building opens this popup, and its footprint glows. */
  osm?: string;
  /** `private` shows the landowner's-permission warning; `public` says it's open to visitors. */
  access?: 'private' | 'public';
  /** Overrides the default access message. */
  accessNote?: string;
  /** The position is a best guess: the popup says so. */
  approximate?: boolean;
  zoom?: number;
  bearing?: number;
  sources?: { title: string; url: string }[];
}

interface PoiCollection {
  type: 'FeatureCollection';
  /** Shown once as a dismissible banner, and kept in the panel. */
  notice?: { title: string; text: string };
  features: {
    geometry: { type: 'Point'; coordinates: [number, number] };
    properties: PoiProperties;
  }[];
}

export interface PoiOptions {
  /** URL of the POI GeoJSON. */
  url: string;
  /** URL of the toy-town data file, for the footprints of POIs with an `osm` id. */
  data: string;
  /** The demo panel, to add the tour list to. */
  panel: HTMLElement;
  /** Shared with the demo, so only one popup is open at a time. */
  popup: maplibregl.Popup;
  /** The ToyTown layer id, if not the default. */
  layerId?: string;
}

/** The bits of the toy-town data file used here. */
interface TownFeature {
  type: 'Feature';
  geometry: { type: string };
  properties: { id: string; height?: number };
}
interface TownData {
  type: 'FeatureCollection';
  features: TownFeature[];
}

interface Poi {
  props: PoiProperties;
  lngLat: [number, number];
  pin: HTMLButtonElement;
}

const PRIVATE_NOTE =
  "On private land. Ask the landowner's permission before visiting, and close any gates behind you.";
const PUBLIC_NOTE = 'Open to visitors.';
const NOTICE_KEY = 'toytown-poi-notice-dismissed';

const escape = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const safeUrl = (u: string) => (/^https?:\/\//.test(u) ? escape(u) : '#');

/** Adds the POIs to the map. Returns the click hook for `startDemo({ click })`. */
export function addPois(map: maplibregl.Map, o: PoiOptions) {
  const pois: Poi[] = [];
  const byOsm = new Map<string, Poi>();
  let selected: Poi | null = null;

  const footprintIds = () => pois.map((p) => p.props.osm).filter((id): id is string => !!id);

  function select(poi: Poi | null) {
    if (selected) selected.pin.classList.remove('selected');
    if (selected?.props.osm && map.getSource('poi-footprints'))
      map.setFeatureState(
        { source: 'poi-footprints', id: selected.props.osm },
        { selected: false },
      );
    selected = poi;
    if (!poi) return;
    poi.pin.classList.add('selected');
    if (poi.props.osm && map.getSource('poi-footprints'))
      map.setFeatureState({ source: 'poi-footprints', id: poi.props.osm }, { selected: true });
  }

  function popupHtml(poi: Poi): string {
    const p = poi.props;
    const i = pois.indexOf(poi);
    const access =
      p.access === 'private'
        ? `<p class="poi-access private" role="note"><strong>Private land.</strong> ${escape(p.accessNote ?? PRIVATE_NOTE)}</p>`
        : p.access === 'public'
          ? `<p class="poi-access public">${escape(p.accessNote ?? PUBLIC_NOTE)}</p>`
          : '';
    const links = [
      ...(p.sources ?? []).map(
        (s) => `<a href="${safeUrl(s.url)}" target="_blank" rel="noopener">${escape(s.title)}</a>`,
      ),
      ...(p.osm
        ? [
            `<a href="https://www.openstreetmap.org/${escape(p.osm)}" target="_blank" rel="noopener">OpenStreetMap</a>`,
          ]
        : []),
    ];
    return `<div class="poi-popup">
      <div class="poi-kind ${escape(p.group ?? '')}">${escape(p.kind)}${p.period ? ` · ${escape(p.period)}` : ''}</div>
      <strong>${escape(p.title)}</strong>
      ${p.text.map((t) => `<p>${escape(t)}</p>`).join('')}
      ${access}
      ${p.approximate ? '<p class="poi-approx">Location approximate.</p>' : ''}
      ${links.length ? `<p class="poi-links">${links.join(' · ')}</p>` : ''}
      <div class="poi-nav">
        <button type="button" data-step="-1" aria-label="Previous place">‹ Prev</button>
        <span>${i + 1} / ${pois.length}</span>
        <button type="button" data-step="1" aria-label="Next place">Next ›</button>
      </div>
    </div>`;
  }

  function open(poi: Poi, lngLat: maplibregl.LngLatLike = poi.lngLat) {
    // Re-adding an open popup fires its `close` (which deselects), so select afterwards.
    // Lift it clear of the pin when it's opened from the pin's own position.
    const offset = lngLat === poi.lngLat ? 22 : 0;
    o.popup
      .setLngLat(lngLat)
      .setOffset(offset)
      .setMaxWidth('300px')
      .setHTML(popupHtml(poi))
      .addTo(map);
    select(poi);
    o.popup
      .getElement()
      ?.querySelector('.poi-nav')
      ?.addEventListener('click', (ev) => {
        const step = (ev.target as HTMLElement).dataset.step;
        if (step) fly(pois[(pois.indexOf(poi) + Number(step) + pois.length) % pois.length]!);
      });
  }

  /** Fly to a POI, then open its popup. */
  function fly(poi: Poi) {
    o.popup.remove();
    select(poi);
    map.flyTo({
      center: poi.lngLat,
      zoom: poi.props.zoom ?? 17.5,
      bearing: poi.props.bearing ?? map.getBearing(),
      pitch: 60,
      // Put the place below the middle, so the popup above it doesn't hide it.
      offset: [0, Math.min(160, map.getContainer().clientHeight / 5)],
      duration: 3000,
      essential: true,
    });
    map.once('moveend', () => open(poi));
  }

  // The popup is shared with the demo's building popups: put it back as it was when it closes.
  o.popup.on('close', () => {
    select(null);
    o.popup.setOffset(0).setMaxWidth('260px');
  });

  function showNotice(notice: NonNullable<PoiCollection['notice']>) {
    if (document.querySelector('.poi-notice')) return;
    const el = document.createElement('div');
    el.className = 'poi-notice';
    el.setAttribute('role', 'note');
    el.innerHTML = `<strong>${escape(notice.title)}</strong>
      <p>${escape(notice.text)}</p>
      <button type="button">Got it</button>`;
    el.querySelector('button')!.addEventListener('click', () => {
      el.remove();
      try {
        localStorage.setItem(NOTICE_KEY, '1');
      } catch {
        // Storage blocked: the notice just comes back next visit.
      }
    });
    document.body.appendChild(el);
  }

  function addFootprints(fc: TownData) {
    // Buildings glow from underneath the 3D layer (the outer half of the line shows round the
    // walls); flat areas like graveyards are drawn on top of it, as their ground is a mesh too.
    const layerId = o.layerId ?? 'toytown';
    const below = map.getLayer(layerId)
      ? layerId
      : map.getStyle().layers.find((l) => l.type === 'symbol')?.id;
    map.addSource('poi-footprints', { type: 'geojson', data: fc, promoteId: 'id' });
    const colour = '#ff8c42';
    const width = ['case', ['boolean', ['feature-state', 'selected'], false], 8, 4];
    map.addLayer(
      {
        id: 'poi-footprints-buildings',
        type: 'line',
        source: 'poi-footprints',
        filter: ['has', 'height'],
        paint: { 'line-color': colour, 'line-width': width as never, 'line-blur': 2 },
      },
      below,
    );
    map.addLayer({
      id: 'poi-footprints-areas',
      type: 'line',
      source: 'poi-footprints',
      filter: ['!', ['has', 'height']],
      paint: {
        'line-color': colour,
        'line-width': width as never,
        'line-dasharray': [2, 1],
        'line-opacity': 0.9,
      },
    });
    if (selected) select(selected);
  }

  async function load() {
    const fc = (await (await fetch(o.url)).json()) as PoiCollection;

    for (const f of fc.features) {
      const props = f.properties;
      const pin = document.createElement('button');
      pin.type = 'button';
      pin.className = `poi-pin ${props.group ?? ''}`;
      pin.textContent = String(pois.length + 1);
      pin.title = props.title;
      pin.setAttribute('aria-label', `${pois.length + 1}: ${props.title}`);
      const poi: Poi = { props, lngLat: f.geometry.coordinates, pin };
      // Stop the click here, so the map doesn't also see it: no building popup underneath, and
      // the popup's close-on-map-click doesn't shut it straight away.
      pin.addEventListener('click', (ev) => {
        ev.stopPropagation();
        open(poi);
      });
      new maplibregl.Marker({ element: pin, anchor: 'center' }).setLngLat(poi.lngLat).addTo(map);
      pois.push(poi);
      if (props.osm) byOsm.set(props.osm, poi);
    }

    // The tour list, in the demo panel under the title.
    const section = document.createElement('div');
    section.className = 'poi-list';
    section.innerHTML = `<h2>Points of interest</h2>
      <ol>${pois.map((p, i) => `<li><button type="button" data-poi="${i}"><span class="poi-num ${escape(p.props.group ?? '')}">${i + 1}</span>${escape(p.props.title)}${p.props.access === 'private' ? ' <span class="poi-lock" title="Private land">⚠</span>' : ''}</button></li>`).join('')}</ol>
      ${fc.notice ? '<button type="button" class="poi-visiting">Visiting? Read this first</button>' : ''}`;
    section.addEventListener('click', (ev) => {
      const button = (ev.target as HTMLElement).closest('button');
      if (!button) return;
      if (button.classList.contains('poi-visiting') && fc.notice) showNotice(fc.notice);
      else if (button.dataset.poi) fly(pois[Number(button.dataset.poi)]!);
    });
    o.panel.querySelector('h1')!.after(section);

    let dismissed = false;
    try {
      dismissed = localStorage.getItem(NOTICE_KEY) === '1';
    } catch {
      // Storage blocked: show it.
    }
    if (fc.notice && !dismissed) showNotice(fc.notice);

    // Footprints of the POIs that are OSM elements in the town's data file.
    const ids = new Set(footprintIds());
    if (ids.size) {
      const data = (await (await fetch(o.data)).json()) as TownData;
      const features = data.features.filter(
        (f) => ids.has(String(f.properties?.id)) && f.geometry.type !== 'Point',
      );
      const add = () => addFootprints({ type: 'FeatureCollection', features });
      if (map.isStyleLoaded()) add();
      else map.once('load', add);
    }
  }

  void load().catch((err) => console.error('Points of interest failed to load', err));

  /** For `startDemo({ click })`: a click on a POI's building opens its popup instead. */
  return (e: ToyTownClickEvent): boolean => {
    const poi = byOsm.get(e.id);
    if (!poi) return false;
    open(poi, e.lngLat);
    return true;
  };
}
