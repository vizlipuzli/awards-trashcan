# awards.trashcan.lan — deployment

Rotating 3D award badges rendered with three.js. Self-contained repo in
`/opt/awards-trashcan`, following the geo/lan/stats pattern (nginx vhost
symlinked from `deploy/`). Static only — there is no backend and no systemd unit.

## Layout
- `web/index.html` — the whole thing: one file, ES module, no build step.
- `web/lib/three/` — vendored three.js **r160** (`build/three.module.js` plus the
  twelve addon files that are actually imported). Committed on purpose: the page
  must render on the LAN with no internet, and pinning the version keeps the
  postprocessing imports from drifting.

## Install / update
```
sudo ln -sfn /opt/awards-trashcan/deploy/nginx.conf /etc/nginx/sites-enabled/awards.trashcan.lan
sudo nginx -t && sudo systemctl reload nginx
```
`*.trashcan.lan` already resolves to 192.168.1.79 by wildcard, so no DNS change.

## Editing the badge
`?t=<seconds>` freezes the animation at that moment — use it for screenshots and
for comparing a change against the reference. Without it the badge rotates.

Everything geometric lives in the top half of the script; see the docs spec at
`~claudeadmin/docs/awards.md` for why the construction is shaped the way it is.
