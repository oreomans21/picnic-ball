# Reference observations and the revised direction

Reference: [Google’s Fourth of July 2019 baseball Doodle](https://doodles.google/doodle/fourth-of-july-2019/), including its [interactive game](https://www.google.com/logos/2019/july4th19/r6/july4th19.html). Captured November 5, 2026.

The reference initially stayed on its loading animation. A later capture successfully reached gameplay. `evidence/reference-ready.png` and `reference-play-*.png` show that actual game; `reference-card.png` is the official H-Dog card used to inspect its silhouette.

## Observed

- Food identities: hot dog in a bun with mustard, scalloped popcorn boxes, watermelon slices, and peanut fielders. The larger reference roster also includes foods outside this project’s bounded roster.
- Faces: oversized white eyes, dark pupils/eyebrows, expressive open smiles, simple blush and mouths.
- Outlines and proportions: confident dark contours, compact bodies, thin black limbs, large white mitt-like hands, caps and visible baseball equipment.
- Composition: close batter at the bottom/left, readable pitcher in the center, peanut defenders behind, high food-character crowd along a blue fence.
- Original field: bright green outfield and a pink checkered picnic-cloth diamond. The camera preserves home-to-outfield orientation.
- Animation poses: weight shifts, raised glove/throwing arm, bat anticipation and follow-through, delighted expressions. These observations informed authored pose keys; original animation frames were not extracted or shipped as the runtime animation system.

## New work and user-requested corrections

The user replaced the initial muted flat treatment with **illustrated 2D food characters on an actual 3D field**. The final environment therefore intentionally uses fresh green grass, orange-brown dirt, a raised mound, modeled bases, a curved blue/yellow fence, overlapping varied trees, a pavilion, clouds and distant hills. The original pink cloth field is not used in the final 3D direction.

The fullscreen HUD uses sans-serif lettering and one instruction strip. Room management and help are temporary overlays. New competition mechanics, runner/base markers, directional sprite views, the wider field camera, pitching meter, room codes, and rematches are multiplayer additions rather than features observed in the original.

Characters were redrawn with thicker limbs, larger readable hands, stronger outlines, painted gradient shading, whole-body pose keys, and consistent equipment attachment. Their designs share a stable articulated rig; they are not a sequence of unrelated generated images. Runtime character textures are transparent, anchored to the feet, and depth-tested against 3D geometry. The camera uses a consistent azimuth; the upright sprite planes do not rotate to face an orbiting camera.

Palette: clear sky blue `#79cafa`, grass greens `#70b83d`/`#7fc343`, warm dirt `#df9452`, fence blues `#2478a3`/`#2d86aa`, yellow accent `#ffcf45`, navy UI `#123953`, warm red sausage `#ed6944`, bun `#ffd27c`, peanut gold `#e4b263`.

## Checkpoint and corrections

The representative sequence includes the 3D batting field, a peanut pitch, hot-dog swing/contact, deliberate running, and a continuous zoom into the field camera. Screenshots were inspected at gameplay size; a recording and slow review/contact sheet were captured.

Corrections made during inspection:

1. Fixed a default 300×150 WebGL backing canvas being stretched to the viewport. The final canvas uses the viewport resolution and a bounded device pixel ratio.
2. Raised character feet and contact shadows onto the mound surface.
3. Matched projected base targets to the runner path and kept camera orientation consistent.
4. Increased foreground sprite texture resolution and attached the bat to the moving hand.
5. Consolidated instruction/status panels, removed the website frame, and kept action controls stable near the bottom.
6. Matched authoritative pitch, swing-contact, scoop, catch, and throw event timing to animation timestamps. The game simulation is independent of render frame rate.

The rest of the roster and the preview sheets use this same art and animation pipeline. Their source, frame anchors, durations, loop behavior, and event markers are recorded in `public/art/manifest.json`.
