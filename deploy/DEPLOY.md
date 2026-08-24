# awards.trashcan.lan — deployment

3D award badges (enamel pins) rendered with three.js. Self-contained repo in
`/opt/awards-trashcan`, following the geo/lan/stats pattern (nginx vhost
symlinked from `deploy/`). Static only — no backend, no systemd unit.

## Pages
- `badge.html?b=<name>` — the generator. Reads `badges/<name>.json` and the
  coloring-book image it names, finds the enamel pockets in the drawing and
  builds the pin. One code path for every award.
- `index.html` — the original hand-coded medal with the golden globe.

Both take `?t=<seconds>` to freeze the animation for screenshots.

## Layout
- `lib/trace.js` — raster line drawing → regions + silhouette.
- `lib/clip.js` — polygon booleans and offsets over Clipper.
- `lib/clipper/` — Clipper 6.4.2 (Boost licence) + ESM wrapper.
- `lib/three/` — three.js r160, vendored (core + the 12 addon files imported).
  Committed on purpose: the page must render on the LAN with no internet, and
  pinning keeps the postprocessing imports from drifting.
- `badges/` — one `.jpg` + `.json` per badge.

## Adding a badge
Drop the line drawing in `badges/`, copy a `.json` next to it, open
`badge.html?b=<name>` and read the console: it prints how many regions were
found and how many got painted. Regions are numbered by descending area; map
number → enamel in the spec.

Watch the two settings that depend on the artwork, not on taste:
`relief.bevel.fence` must be under half the ink stroke width, and `band.width`
must fit the *thinnest* limb of the drawing. Both fail silently when wrong —
see `~claudeadmin/docs/awards.md`.

## Install / update
```
sudo ln -sfn /opt/awards-trashcan/deploy/nginx.conf /etc/nginx/sites-enabled/awards.trashcan.lan
sudo nginx -t && sudo systemctl reload nginx
```
`*.trashcan.lan` already resolves to 192.168.1.79 by wildcard, so no DNS change.
