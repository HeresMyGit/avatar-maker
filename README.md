# mfer avatar playground

The single-page playground at https://playground.mferavatars.xyz/ is published
from the `nomint` branch by `.github/workflows/deploy.yml` through GitHub Pages.
The root page keeps its existing trait panel, camera framing, Photo menu, and
Animated/T-Pose GLB export menu.

## Local development

Use Node 20 or later, run `npm ci`, and set `VITE_WALLETCONNECT_PROJECT_ID` in
an ignored `.env.local` file. The existing wallet integration requires this
public client identifier even when using the standalone playground.

Run `npm run dev`. For a production check, run `npm run build` followed by
`npm run preview -- --host 127.0.0.1 --port 5187 --strictPort`.
Webcam access requires localhost or HTTPS on other devices.

## Avatar features

`public/avatar/mfermashup.glb` contains the curated trait bank: expressive human
and robot mouths, eye controls, tongue, mouth-mounted props, and bones/metadata
for hair, garments, and chains. Robot defaults to its visor and checkerboard
mouth; the Eyes and Mouth menus can override either. Beards retain their original
rigid geometry. Speaker vibration is a separate optional runtime input and is
silent in the playground by default.

Webcam starts only when clicked. Face, body, hands, and neural tongue detection
run in the browser; camera frames are not uploaded, and microphone access is not
requested. Stop, cancellation, hiding the page, and component disposal release
camera resources. Tracking assets load on demand from this site's own origin.

Exports include the selected meshes, textures, bones, morph targets, and runtime
metadata. Animated exports include the source animation; T-Pose exports retain
the original rest pose. GLB viewers can use the standard rig and morph targets.
Webcam tracking, springs, attachment following, and light effects require the
companion runtime or equivalent host code. See [src/avatar/README.md](src/avatar/README.md)
and the licenses/provenance under `public/avatar/vendor/`.

## Checks

`npm run test:avatar` checks the actual GLB, all trait mappings, capture lifecycle
and fallbacks, and export round trips. Browser checks in `tests/` additionally
exercise real texture encoding, exports, robot overrides, and camera cleanup.
They use Playwright and prerecorded Y4M footage, never a physical camera:

```sh
AVATAR_CAMERA_FIXTURE=/absolute/path/tongue-positive.y4m \
AVATAR_MAKER_URL=http://127.0.0.1:5187/ \
node tests/avatar-maker-browser.mjs
```

Set `PLAYWRIGHT_MODULE` if Playwright is installed outside this repository, and
optionally `PLAYWRIGHT_CHANNEL=chrome` to use installed Chrome. Generated reports
and screenshots go to the ignored `test-results/` directory unless
`AVATAR_QA_OUTPUT` is set. Prerecorded checks establish integration behavior;
tracking accuracy still depends on lighting, pose, camera, and device speed.
