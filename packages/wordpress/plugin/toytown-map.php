<?php
/**
 * Plugin Name:       Toytown Map
 * Plugin URI:        https://github.com/bpowerie25/Toytown
 * Description:       Show any village or town as a cartoony 3D toy town, built from OpenStreetMap. A block and a [toytown] shortcode, with 20 skins.
 * Version:           0.1.0
 * Requires at least: 6.5
 * Requires PHP:      7.4
 * Author:            Brian Power
 * License:           MIT
 * License URI:       https://opensource.org/licenses/MIT
 * Text Domain:       toytown-map
 *
 * @package ToytownMap
 */

defined( 'ABSPATH' ) || exit;

define( 'TOYTOWN_MAP_VERSION', '0.1.0' );

/** Built-in skins: theme name => label. */
function toytown_map_skins() {
	return array(
		'default'   => __( 'Day', 'toytown-map' ),
		'night'     => __( 'Night', 'toytown-map' ),
		'sitcom'    => __( 'Sitcom', 'toytown-map' ),
		'pastel'    => __( 'Pastel', 'toytown-map' ),
		'toybox'    => __( 'Toybox', 'toytown-map' ),
		'voxel'     => __( 'Voxel', 'toytown-map' ),
		'chunky'    => __( 'Chunky', 'toytown-map' ),
		'retro'     => __( 'Retro handheld', 'toytown-map' ),
		'neon'      => __( 'Neon', 'toytown-map' ),
		'vintage'   => __( 'Vintage', 'toytown-map' ),
		'sketch'    => __( 'Ink sketch', 'toytown-map' ),
		'handdrawn' => __( 'Hand-drawn', 'toytown-map' ),
		'comic'     => __( 'Comic', 'toytown-map' ),
		'blueprint' => __( 'Blueprint', 'toytown-map' ),
		'golden'    => __( 'Golden hour', 'toytown-map' ),
		'autumn'    => __( 'Autumn', 'toytown-map' ),
		'winter'    => __( 'Winter', 'toytown-map' ),
		'christmas' => __( 'Christmas', 'toytown-map' ),
		'halloween' => __( 'Halloween', 'toytown-map' ),
		'shamrock'  => __( 'Shamrock', 'toytown-map' ),
	);
}

/**
 * Clean map settings from block attributes or shortcode attributes. Returns null without a place.
 *
 * @param array $atts Raw attributes.
 * @return array|null
 */
function toytown_map_config( $atts ) {
	$atts = is_array( $atts ) ? $atts : array();
	$num  = static function ( $key, $default, $min, $max ) use ( $atts ) {
		$v = isset( $atts[ $key ] ) && is_numeric( $atts[ $key ] ) ? (float) $atts[ $key ] : $default;
		return max( $min, min( $max, $v ) );
	};
	if ( ! isset( $atts['lat'], $atts['lng'] ) || ! is_numeric( $atts['lat'] ) || ! is_numeric( $atts['lng'] ) ) {
		return null;
	}
	$skin = isset( $atts['skin'] ) ? sanitize_key( $atts['skin'] ) : 'default';
	if ( ! array_key_exists( $skin, toytown_map_skins() ) ) {
		$skin = 'default';
	}
	$config = array(
		'lat'     => $num( 'lat', 0, -85, 85 ),
		'lng'     => $num( 'lng', 0, -180, 180 ),
		'size'    => $num( 'size', 1.5, 0.3, 3.4 ),
		'skin'    => $skin,
		'height'  => (int) $num( 'height', 480, 200, 1200 ),
		'zoom'    => $num( 'zoom', 16.2, 13, 19 ),
		'pitch'   => $num( 'pitch', 55, 0, 70 ),
		'bearing' => $num( 'bearing', 0, -180, 180 ),
		'models'  => plugins_url( 'public/models/manifest.json', __FILE__ ),
	);
	// Optional prebuilt data file (from `npx @toytown/cli build-data`), for towns over 12 km².
	if ( ! empty( $atts['data'] ) ) {
		$config['data'] = esc_url_raw( $atts['data'] );
	}
	return $config;
}

/** Register the front-end assets (enqueued only on pages with a map). */
function toytown_map_register_assets() {
	$base = plugins_url( 'public/', __FILE__ );
	wp_register_style( 'toytown-maplibre', $base . 'vendor/maplibre-gl.css', array(), TOYTOWN_MAP_VERSION );
	wp_register_style( 'toytown-map', $base . 'toytown-map.css', array( 'toytown-maplibre' ), TOYTOWN_MAP_VERSION );
	wp_register_script( 'toytown-gl', $base . 'vendor/toytown-gl.umd.js', array(), TOYTOWN_MAP_VERSION, true );
	wp_register_script_module( 'toytown-map-view', $base . 'view.js', array(), TOYTOWN_MAP_VERSION );
}
add_action( 'init', 'toytown_map_register_assets' );

/**
 * The map's markup. The view module finds it and starts the map once it scrolls into view.
 *
 * @param array $atts Block or shortcode attributes.
 * @return string
 */
function toytown_map_render( $atts ) {
	$config = toytown_map_config( $atts );
	if ( ! $config ) {
		return current_user_can( 'edit_posts' )
			? '<p class="toytown-map-missing">' . esc_html__( 'Toytown Map: choose a place (lat and lng).', 'toytown-map' ) . '</p>'
			: '';
	}
	wp_enqueue_style( 'toytown-map' );
	wp_enqueue_script( 'toytown-gl' );
	wp_enqueue_script_module( 'toytown-map-view' );
	return sprintf(
		'<div class="toytown-map" style="height:%1$dpx" data-config="%2$s"><div class="toytown-map__canvas"></div><div class="toytown-map__status" role="status" aria-live="polite">%3$s</div><noscript>%4$s</noscript></div>',
		(int) $config['height'],
		esc_attr( wp_json_encode( $config ) ),
		esc_html__( 'Loading the map…', 'toytown-map' ),
		esc_html__( 'This map needs JavaScript.', 'toytown-map' )
	);
}

/**
 * [toytown lat="52.1655" lng="-8.8265" size="1.5" skin="sitcom" height="480"]
 *
 * @param array|string $atts Shortcode attributes.
 * @return string
 */
function toytown_map_shortcode( $atts ) {
	$atts = shortcode_atts(
		array(
			'lat'     => '',
			'lng'     => '',
			'size'    => '1.5',
			'skin'    => 'default',
			'height'  => '480',
			'zoom'    => '16.2',
			'pitch'   => '55',
			'bearing' => '0',
			'data'    => '',
		),
		$atts,
		'toytown'
	);
	return toytown_map_render( $atts );
}
add_shortcode( 'toytown', 'toytown_map_shortcode' );

/** The block: same settings, rendered on the server by toytown_map_render. */
function toytown_map_register_block() {
	register_block_type(
		__DIR__ . '/block',
		array(
			'render_callback' => static function ( $attributes ) {
				return toytown_map_render( $attributes );
			},
		)
	);
	wp_add_inline_script(
		'toytown-map-editor-script',
		'window.toytownMapEditor = ' . wp_json_encode(
			array(
				'preview' => plugins_url( 'public/preview.html', __FILE__ ),
				'models'  => plugins_url( 'public/models/manifest.json', __FILE__ ),
				'skins'   => toytown_map_skins(),
			)
		) . ';',
		'before'
	);
}
add_action( 'init', 'toytown_map_register_block', 20 );
