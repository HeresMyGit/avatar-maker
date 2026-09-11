# Selected avatar exports

`exportAvatar(pristineGltf, visibleMeshNames, 'animated' | 't-pose')` returns a GLB `ArrayBuffer`. Pass the untouched GLTFLoader result and actual selected mesh node names. The live webcam/avatar instance is never the export source.

The export retains selected traits, their original morph targets and materials, all skeleton joints, and the collapsed neutral tongue. Unselected mesh nodes are removed. Animated exports include the source animation clips; T-pose exports use the skeleton bind pose without animation clips. Every facial morph exports at zero. Source geometry, pose, materials, clips, and metadata remain untouched.

Current curated defaults are Enhanced tracking, automatic neural tongue detection, Expressive robot mouth with independent voice input at zero, and authored hair/hood/shirt/jewelry motion. Original compatible morph targets remain available in the GLB. No pixel-tapping tongue workflow is included.

Robot exports preserve `robotGrilleOpen`, all expression targets, and independent
`robotGrillePulse`, `robotGrilleRipple`, and `robotGrilleCounter` targets. The
metadata records `robotVoice: 'independent'`, `robotVoiceLevel: 0`, and the available
`robotVoiceMode: 'speaker'`. Camera opening does not automatically produce a
speaker pulse. The companion driver accepts an explicit `robotVoiceLevel` for
voice-only animation; see the opening-only and pulse-only examples in the runtime
README. No mesh targets or geometry are removed by this default change.

## Runtime metadata

The scene extras contain filtered `mouthProps`, `tongue`, `mferSecondaryMotion`, and `mferAvatar` data. Physics is also retained in the top-level glTF extras. Only selected physics chains and their colliders are described. Robot metadata describes the accepted expressive split-row grille, rather than earlier static experiments.

The props and tongue adapters compare the selected mouth against the neutral `mouth_smile` geometry. When Smile is absent from the exported avatar, `mferRuntimeReferences` contains only the needed reference vertices, skinning data, and bind transforms. These samples are metadata, so generic GLB viewers do not draw an extra mouth or other unselected traits.

The companion `createAvatarDriver(avatar, gltf)` restores these reference samples automatically. For direct controller use:

```js
import { hydrateAvatarReferences } from './hydrate-avatar-references.js';

const references = hydrateAvatarReferences(avatar);
const props = createMouthProps(avatar);
const tongue = createTongue(avatar);
// Update after body/face pose and world matrices, as in the existing adapters.
// On teardown, dispose controllers first, then references.
props.dispose();
tongue.dispose();
references.dispose();
```

Hydration creates a tiny hidden in-memory `SkinnedMesh` whose reserved name is listed in the filtered manifests. Keep it hidden. It has no visible trait material and is never stored as a glTF mesh primitive.

GLB exports carry geometry and controls, not executing webcam inference or physics. Other apps need the companion runtime or equivalent bone/morph drivers. This is a GLB workflow; no VRM humanoid/expression/spring extension mapping is added. Preserve vertex order when optimizing the asset, or remap and validate attachment samples.

## Verification

Run `node tests/run-export-avatar.mjs` from the project. Tests round-trip selected Robot animated, Metal Flat T-pose, and Original Smile exports through Three.js GLTFLoader, validate geometry/morph/skin/metadata retention and source isolation, compare attachment motion against the full bank after head/spine/mouth movement, and exercise the complete driver on reimported exports. Texture decoding and encoding are stubbed in this Node test; browser visual verification remains a separate check.
