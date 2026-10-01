/**
 * Toytown Map block, editor side. No build step: plain JavaScript on WordPress's globals.
 * The preview is the real map in an iframe (public/preview.html), so it works inside the iframed
 * editor and looks exactly like the published page.
 */
( function ( blocks, blockEditor, components, element, i18n ) {
	const el = element.createElement;
	const { useEffect, useState } = element;
	const { __, sprintf } = i18n;
	const { InspectorControls, useBlockProps } = blockEditor;
	const { PanelBody, TextControl, Button, SelectControl, RangeControl, Placeholder } = components;
	const cfg = window.toytownMapEditor || {};

	/** Search OpenStreetMap's Nominatim for a place (user-initiated, so well within its usage policy). */
	async function findPlace( query ) {
		const url =
			'https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5&q=' +
			encodeURIComponent( query );
		const res = await fetch( url, { headers: { 'Accept-Language': document.documentElement.lang || 'en' } } );
		if ( ! res.ok ) throw new Error( 'HTTP ' + res.status );
		// Towns and villages first: an admin area of the same name has its centre out in the fields.
		const rank = ( r ) => ( r.category === 'place' || r.class === 'place' ? 0 : 1 );
		return ( await res.json() ).sort( ( x, y ) => rank( x ) - rank( y ) );
	}

	function PlaceSearch( { onPick } ) {
		const [ query, setQuery ] = useState( '' );
		const [ results, setResults ] = useState( [] );
		const [ error, setError ] = useState( '' );
		const [ busy, setBusy ] = useState( false );
		const search = async () => {
			if ( ! query.trim() ) return;
			setBusy( true );
			setError( '' );
			try {
				const r = await findPlace( query );
				setResults( r );
				if ( ! r.length ) setError( __( 'No places found.', 'toytown-map' ) );
			} catch {
				setError( __( 'Search failed; try again.', 'toytown-map' ) );
			}
			setBusy( false );
		};
		return el(
			'div',
			{ className: 'toytown-map-search' },
			el( TextControl, {
				label: __( 'Find a place', 'toytown-map' ),
				value: query,
				placeholder: __( 'e.g. Tramore, Ireland', 'toytown-map' ),
				onChange: setQuery,
				onKeyDown: ( e ) => e.key === 'Enter' && ( e.preventDefault(), search() ),
				__nextHasNoMarginBottom: true,
			} ),
			el( Button, { variant: 'secondary', onClick: search, isBusy: busy, disabled: busy }, __( 'Search', 'toytown-map' ) ),
			error && el( 'p', { className: 'toytown-map-search__error' }, error ),
			el(
				'ul',
				{ className: 'toytown-map-search__results' },
				results.map( ( r ) =>
					el(
						'li',
						{ key: r.place_id },
						el( Button, {
							variant: 'link',
							onClick: () => {
								onPick( r );
								setResults( [] );
							},
						}, r.display_name )
					)
				)
			),
			el( 'p', { className: 'toytown-map-search__credit' }, __( 'Search by Nominatim, © OpenStreetMap contributors', 'toytown-map' ) )
		);
	}

	function Edit( { attributes: a, setAttributes, isSelected, clientId } ) {
		const props = useBlockProps();
		const hasPlace = typeof a.lat === 'number' && typeof a.lng === 'number';
		const pick = ( r ) =>
			setAttributes( {
				lat: Math.round( Number( r.lat ) * 1e5 ) / 1e5,
				lng: Math.round( Number( r.lon ) * 1e5 ) / 1e5,
				place: r.display_name.split( ',' ).slice( 0, 2 ).join( ',' ),
			} );
		const skins = Object.entries( cfg.skins || { default: 'Day' } ).map( ( [ value, label ] ) => ( { value, label } ) );
		const config = {
			preview: clientId,
			lat: a.lat,
			lng: a.lng,
			size: a.size,
			skin: a.skin,
			height: a.height,
			zoom: a.zoom,
			pitch: a.pitch,
			bearing: a.bearing,
			models: cfg.models,
			...( a.data ? { data: a.data } : {} ),
		};
		// The preview reloads when the settings change (an iframe ignores a new #hash), but only once
		// they've been still for a moment, so dragging a slider doesn't reload it on every step.
		const wanted = JSON.stringify( config );
		const [ shown, setShown ] = useState( wanted );
		useEffect( () => {
			const t = setTimeout( () => setShown( wanted ), 600 );
			return () => clearTimeout( t );
		}, [ wanted ] );
		// Until a place is set there's nothing to wait for: show it straight away.
		const live = typeof JSON.parse( shown ).lat === 'number' ? shown : wanted;

		// The preview reports its view as you move it; "Use this view" saves it.
		const [ view, setView ] = useState( null );
		useEffect( () => {
			const onMessage = ( e ) => {
				const v = e.data && e.data.toytownView;
				if ( e.origin === window.location.origin && v && v.preview === clientId ) setView( v );
			};
			window.addEventListener( 'message', onMessage );
			return () => window.removeEventListener( 'message', onMessage );
		}, [ clientId ] );
		const round = ( x, d ) => Math.round( x * 10 ** d ) / 10 ** d;
		const moved =
			view &&
			( Math.abs( view.lat - a.lat ) > 1e-5 ||
				Math.abs( view.lng - a.lng ) > 1e-5 ||
				Math.abs( view.zoom - a.zoom ) > 0.05 ||
				Math.abs( view.pitch - a.pitch ) > 0.5 ||
				Math.abs( view.bearing - a.bearing ) > 0.5 );
		const useView = () =>
			setAttributes( {
				lat: round( view.lat, 5 ),
				lng: round( view.lng, 5 ),
				zoom: round( view.zoom, 1 ),
				pitch: Math.round( view.pitch ),
				bearing: Math.round( view.bearing ),
			} );
		const settings = el(
			InspectorControls,
			null,
			el(
				PanelBody,
				{ title: __( 'Place', 'toytown-map' ) },
				a.place && el( 'p', null, sprintf( __( 'Showing: %s', 'toytown-map' ), a.place ) ),
				el( 'p', { className: 'toytown-map-help' }, __( 'Tip: move the preview to frame the map, then use “Use this view”.', 'toytown-map' ) ),
				moved && el( Button, { variant: 'primary', onClick: useView }, __( 'Use this view', 'toytown-map' ) ),
				el( PlaceSearch, { onPick: pick } ),
				el( RangeControl, {
					label: __( 'Area (km across)', 'toytown-map' ),
					help: __( 'Built from OpenStreetMap in the visitor’s browser. Up to 3.4 km; for bigger towns, use a data file.', 'toytown-map' ),
					value: a.size,
					min: 0.3,
					max: 3.4,
					step: 0.1,
					onChange: ( v ) => setAttributes( { size: v } ),
				} )
			),
			el(
				PanelBody,
				{ title: __( 'Look', 'toytown-map' ) },
				el( SelectControl, {
					label: __( 'Skin', 'toytown-map' ),
					value: a.skin,
					options: skins,
					onChange: ( v ) => setAttributes( { skin: v } ),
					__nextHasNoMarginBottom: true,
				} ),
				el( RangeControl, { label: __( 'Height (px)', 'toytown-map' ), value: a.height, min: 200, max: 1200, step: 10, onChange: ( v ) => setAttributes( { height: v } ) } ),
				el( RangeControl, { label: __( 'Zoom', 'toytown-map' ), value: a.zoom, min: 13, max: 19, step: 0.1, onChange: ( v ) => setAttributes( { zoom: v } ) } ),
				el( RangeControl, { label: __( 'Tilt', 'toytown-map' ), value: a.pitch, min: 0, max: 70, onChange: ( v ) => setAttributes( { pitch: v } ) } ),
				el( RangeControl, { label: __( 'Rotation', 'toytown-map' ), value: a.bearing, min: -180, max: 180, onChange: ( v ) => setAttributes( { bearing: v } ) } )
			),
			el(
				PanelBody,
				{ title: __( 'Advanced', 'toytown-map' ), initialOpen: false },
				el( TextControl, {
					label: __( 'Data file URL (optional)', 'toytown-map' ),
					help: __( 'A file from `npx @toytown/cli build-data`, for areas too big to build in the browser.', 'toytown-map' ),
					value: a.data,
					onChange: ( v ) => setAttributes( { data: v } ),
				} )
			)
		);
		if ( ! hasPlace )
			return el(
				'div',
				props,
				settings,
				el(
					Placeholder,
					{ icon: 'location-alt', label: __( 'Toytown Map', 'toytown-map' ), instructions: __( 'Find the village or town to show.', 'toytown-map' ) },
					el( PlaceSearch, { onPick: pick } )
				)
			);
		return el(
			'div',
			props,
			settings,
			el(
				'div',
				{ style: { position: 'relative' } },
				el( 'iframe', {
					key: live,
					className: 'toytown-map-preview',
					title: __( 'Toytown Map preview', 'toytown-map' ),
					src: cfg.preview + '#' + encodeURIComponent( live ),
					style: { display: 'block', width: '100%', height: a.height + 'px', border: 0 },
				} ),
				// An iframe swallows clicks, so until the block is selected, a transparent cover
				// passes the first click to the editor (which selects the block); after that the
				// map can be dragged and zoomed to try it out.
				! isSelected && el( 'div', { className: 'toytown-map-preview__cover', style: { position: 'absolute', inset: 0 } } ),
				isSelected &&
					moved &&
					el(
						'div',
						{ style: { position: 'absolute', left: 12, bottom: 12 } },
						el( Button, { variant: 'primary', onClick: useView }, __( 'Use this view', 'toytown-map' ) )
					)
			)
		);
	}

	blocks.registerBlockType( 'toytown/map', { edit: Edit, save: () => null } );
} )( window.wp.blocks, window.wp.blockEditor, window.wp.components, window.wp.element, window.wp.i18n );
