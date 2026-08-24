# awards.trashcan.lan — deployment

3D award badges (enamel pins) rendered with three.js. Self-contained repo in
`/opt/awards-trashcan`, following the geo/lan/stats pattern (nginx vhost
symlinked from `deploy/`). Static only — no backend, no systemd unit.

## Pages
- `badge.html?b=<name>` — the generator: reads `badges/<name>.json` and the
  coloring-book image it names, finds the enamel pockets and builds the pin.
  Left panel edits every parameter live and paints regions by clicking them.
- `pin.html?p=<name>` — shows baked contours. The default way to embed.
- `view.html?m=<name>` — shows a baked `.glb`.
- `embed.html` — the three embed paths side by side with their weights.
- `index.html` — the original hand-coded medal with the golden globe.

`?t=<seconds>` freezes the animation on any of them.

## Layout
- `lib/` — trace (raster → regions), clip (Clipper), enamel (meniscus), poly
  (pure geometry helpers), look (light, shared by editor and viewers).
- `lib/three/` — three.js r160, vendored. `lib/clipper/` — Clipper 6.4.2.
- `badges/` — one `.jpg` + `.json` per badge.
- `bake/` — the bakers. `dist/` — their output, gitignored and reproducible.

## Baking
```
node bake/contours.js toucan            # 84 КБ gzip — по умолчанию
node bake/bake.js toucan 512 40 swing   # анимированный WebP
node bake/glb.js toucan                 # модель .glb
```
Each drives `badge.html?bake=1` in headless Chrome against a local server, so no
renderer is reimplemented. Set `ORIGIN` if the server is not on port 8791.

## Adding a badge
Drop the drawing in `badges/`, copy a `.json` next to it, open the panel and read
the status line: it prints how many regions were found and the two settings
measured from the artwork. Both of those fail silently when wrong — see
`~claudeadmin/docs/awards.md`.

## Install / update
```
sudo ln -sfn /opt/awards-trashcan/deploy/nginx.conf /etc/nginx/sites-enabled/awards.trashcan.lan
sudo nginx -t && sudo systemctl reload nginx
```
`*.trashcan.lan` already resolves to 192.168.1.79 by wildcard.
