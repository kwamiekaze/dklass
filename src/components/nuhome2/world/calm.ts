import * as THREE from 'three';

/*
 * No flicker, at any distance.
 *
 * Fine, glossy detail flickers when it gets smaller than a pixel: the slate laps on the roofs, the mortar joints, the bevels of the gilded
 * letters and the facets of the stars. From one frame to the next a highlight lands on a pixel or misses it, so it blinks as the camera
 * drifts. This patch is applied once, to every lit material in the scene (MeshStandardMaterial and MeshPhysicalMaterial):
 *
 *  1. Specular anti-aliasing (Tokuyoshi & Kaplanyan 2019). Where the surface normal changes a lot from one pixel to the next, the detail is
 *     too small to resolve, so the highlight is widened just enough to cover the pixel instead of blinking. Up close nothing changes.
 *  2. Calm with distance. Past CALM_NEAR metres the bump detail fades a little and the gloss softens toward a satin finish, all the way by
 *     CALM_FAR. Close up, the roof, the stone and the gold look exactly as before; far away they hold still, the way they do to the eye.
 *
 * Colour, emissive light and texture are untouched: only the size of highlights changes, so nothing gets darker or duller in colour.
 */
export const CALM_NEAR = 26, CALM_FAR = 90;

const CALM = /* glsl */`
	{
		float dkCalm = smoothstep( ${CALM_NEAR.toFixed(1)}, ${CALM_FAR.toFixed(1)}, length( vViewPosition ) );
		normal = normalize( mix( normal, nonPerturbedNormal, 0.55 * dkCalm ) );
		vec3 dkDx = dFdx( normal ), dkDy = dFdy( normal );
		float dkKernel = min( 2.0 * 0.5 * ( dot( dkDx, dkDx ) + dot( dkDy, dkDy ) ), 0.18 );
		float dkR = max( roughnessFactor, 0.0525 );
		roughnessFactor = min( 1.0, sqrt( dkR * dkR + dkKernel ) );
		roughnessFactor = mix( roughnessFactor, max( roughnessFactor, 0.58 ), dkCalm );
	}
`;

let done = false;
/** Install the patch. Call before the first material compiles; calling again does nothing. */
export function installCalm() {
	if (done) return; done = true;
	const chunk = THREE.ShaderChunk as Record<string, string>;
	if (!chunk.lights_physical_fragment!.includes('dkCalm')) chunk.lights_physical_fragment = CALM + chunk.lights_physical_fragment;
}
installCalm();
