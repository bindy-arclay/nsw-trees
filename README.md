# NSW Trees

A phone app for learning the 50 most common trees on NSW bushwalks, with photo identification by [Pl@ntNet](https://plantnet.org).

It's a Progressive Web App: plain HTML, CSS and JavaScript with no build step, hosted on GitHub Pages and added to the phone's home screen.

## Files

- `data/trees.json`: the tree list and notes. Trees with `"ready": true` show in the app; the rest are used to match photo ID results.
- `theme.css`: every colour, font and spacing value. Change the look here.
- `styles.css`: layout.
- `fonts/`: Cormorant Garamond and Source Serif 4 (SIL Open Font License), stored here so the app works offline.
- `art/`: ink-and-watercolour drawings. Each tree page shows one chosen by the tree's family (gum, banksia, wattle or leaf) until it has its own hero drawing.
- `app.js`: pages, reference photos (from iNaturalist until the tree has its own `photos`), and photo ID.
- `sw.js`: offline support. Bump `VERSION` whenever app files change.

## Pl@ntNet key

The key is never stored in this repository. It's typed into the app's Settings page on the phone, saved on that phone only, and sent only to Pl@ntNet. The key should be limited to this site's address in the Pl@ntNet account settings.

## Adding a tree's own photos

Add entries to that tree's `photos` list in `data/trees.json`:

```json
{ "thumb": "photos/angophora-costata/bark-small.jpg", "src": "photos/angophora-costata/bark.jpg", "credit": "Andy, 2026" }
```

## Adding a tree's hero drawing

Put the drawing in `art/trees/`, named after the tree's slug, then add it to that tree in `data/trees.json`:

```json
"hero": "art/trees/scribbly-gum.jpg"
```

Save it as a portrait JPG, 1024 × 1536 px, on a pure white background. At that size each drawing is about 250 KB, which keeps the app quick on the track.

The drawing shows at the top of the tree's page and replaces the shared drawing for that tree only.
