/**
 * Toytown Map, front end: starts every `.toytown-map` on the page once it scrolls into view.
 * MapLibre is bundled with the plugin as an ES module; toytown-gl is the `ToyTownGL` global.
 */
import * as maplibregl from './vendor/maplibre-gl.mjs';

/** A square area `size` km across, centred on the place: [west, south, east, north]. */
function areaAround( lat, lng, size ) {
	const dLat = size / 2 / 111.32;
	const dLng = size / 2 / ( 111.32 * Math.cos( ( lat * Math.PI ) / 180 ) );
	return [ lng - dLng, lat - dLat, lng + dLng, lat + dLat ];
}

export function mount( root ) {
	if ( root.dataset.started ) return;
	root.dataset.started = '1';
	const c = JSON.parse( root.dataset.config );
	const status = root.querySelector( '.toytown-map__status' );
	const say = ( text, error ) => {
		status.textContent = text;
		status.hidden = ! text;
		status.classList.toggle( 'is-error', !! error );
	};
	const { ToyTown } = window.ToyTownGL;
	const map = new maplibregl.Map( {
		container: root.querySelector( '.toytown-map__canvas' ),
		style: ToyTown.style( { theme: c.skin } ),
		center: [ c.lng, c.lat ],
		zoom: c.zoom,
		pitch: c.pitch,
		bearing: c.bearing,
		maxPitch: 70,
		cooperativeGestures: true, // the page scrolls normally; Ctrl/⌘ or two fingers move the map
		attributionControl: { compact: true },
	} );
	map.addControl( new maplibregl.NavigationControl( { visualizePitch: true } ), 'top-right' );
	const toy = new ToyTown( {
		...( c.data ? { data: c.data } : { area: areaAround( c.lat, c.lng, c.size ) } ),
		models: c.models,
		theme: c.skin,
	} );
	toy.on( 'status', ( s ) =>
		say( s.state === 'ready' ? '' : s.state === 'error' ? `Couldn’t load the map: ${ s.message }` : `${ s.message }…`, s.state === 'error' )
	);
	toy.addTo( map );
	root.toytown = { map, toy };
}

function start() {
	const roots = document.querySelectorAll( '.toytown-map[data-config]' );
	if ( ! ( 'IntersectionObserver' in window ) ) return roots.forEach( mount );
	const io = new IntersectionObserver(
		( entries ) => {
			for ( const e of entries ) {
				if ( ! e.isIntersecting ) continue;
				io.unobserve( e.target );
				mount( e.target );
			}
		},
		{ rootMargin: '200px' }
	);
	roots.forEach( ( r ) => io.observe( r ) );
}

if ( document.readyState === 'loading' ) document.addEventListener( 'DOMContentLoaded', start );
else start();
