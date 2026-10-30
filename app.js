const PLANTNET_URL = 'https://my-api.plantnet.org/v2/identify/all';
const INAT_API = 'https://api.inaturalist.org/v1';
const KEY_STORE = 'plantnetKey';
const PHOTO_CACHE_DAYS = 30;
const MAX_ID_PHOTOS = 5;
const ORGANS = [
  ['auto', 'Not sure'], ['leaf', 'Leaf'], ['bark', 'Bark'], ['flower', 'Flower'], ['fruit', 'Fruit / gumnut'],
];

const view = document.getElementById('view');
let trees = [];
let idPhotos = []; // photos picked on the Identify page: { blob, url, organ }

// ---------- helpers ----------

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const store = {
  get(key) { try { return localStorage.getItem(key); } catch { return null; } },
  set(key, value) { try { localStorage.setItem(key, value); } catch { /* storage full or blocked */ } },
  remove(key) { try { localStorage.removeItem(key); } catch { /* ignore */ } },
};

const speciesKey = (name) => String(name || '').trim().toLowerCase().split(/\s+/).slice(0, 2).join(' ');

// Splits "Sydney Red Gum (Smooth-barked Apple)" into a name and an alternative name.
function names(tree) {
  const m = tree.common.match(/^(.*?)\s*\((.*)\)$/);
  return m ? { main: m[1], alt: m[2] } : { main: tree.common, alt: null };
}

// The ink-and-watercolour drawing that decorates a tree's page until it has its own hero drawing.
function motif(tree) {
  if (/Banksia|Proteaceae/.test(tree.family)) return 'art/banksia.svg';
  if (/Wattle/.test(tree.family)) return 'art/wattle.svg';
  if (/Eucalypt|Angophora/.test(tree.family)) return 'art/gum.svg';
  return 'art/leaf.svg';
}

function findTree(scientificName) {
  const key = speciesKey(scientificName);
  const genus = key.split(' ')[0];
  return trees.find((t) => t.matchNames.some((n) => speciesKey(n) === key))
    || trees.find((t) => t.matchGenera.some((g) => g.toLowerCase() === genus));
}

// ---------- reference photos ----------
// The tree's own photos (from data/trees.json) come first. Until there are some,
// photos load from iNaturalist and are kept on the phone for 30 days.

async function inatPhotos(tree) {
  const cacheKey = `photos:v1:${tree.slug}`;
  const cached = JSON.parse(store.get(cacheKey) || 'null');
  if (cached && Date.now() - cached.at < PHOTO_CACHE_DAYS * 864e5) return cached.data;

  const q = encodeURIComponent(tree.photoSearch);
  const search = await fetch(`${INAT_API}/taxa?q=${q}&is_active=true&per_page=10&locale=en`).then((r) => r.json());
  const taxon = search.results.find((t) => t.name.toLowerCase() === tree.photoSearch.toLowerCase()) || search.results[0];
  if (!taxon) return null;
  const detail = await fetch(`${INAT_API}/taxa/${taxon.id}?locale=en`).then((r) => r.json());
  const full = detail.results[0] || taxon;
  const photos = (full.taxon_photos || [])
    .map((tp) => tp.photo)
    .filter((p) => p && p.license_code)
    .slice(0, 8)
    .map((p) => ({
      thumb: p.square_url || p.url,
      src: p.medium_url || (p.url || '').replace('/square.', '/medium.'),
      credit: p.attribution,
    }));
  const data = { photos, source: `https://www.inaturalist.org/taxa/${taxon.id}` };
  store.set(cacheKey, JSON.stringify({ at: Date.now(), data }));
  return data;
}

async function getPhotos(tree) {
  if (tree.photos.length) return { photos: tree.photos, source: null };
  try { return await inatPhotos(tree); } catch { return null; }
}

// ---------- pages ----------

function treeList() {
  const ready = trees.filter((t) => t.ready);
  const waiting = trees.length - ready.length;
  view.innerHTML = `
    <div class="intro">
      <img class="motif" src="art/gum.svg" alt="">
      <h1>Your trees</h1>
      <p class="sci-name">of the NSW bush</p>
    </div>
    <input class="search" type="search" placeholder="Search by name, bark or leaf" aria-label="Search trees">
    <ul class="card-list" id="list"></ul>
    <p class="on-the-way">${waiting} more trees from your list of ${trees.length} are on the way.</p>`;
  const list = view.querySelector('#list');
  const render = (term) => {
    const t = term.trim().toLowerCase();
    const shown = ready.filter((tree) => !t || [tree.common, tree.scientific, tree.bark, tree.leaves, tree.barkType]
      .join(' ').toLowerCase().includes(t));
    list.innerHTML = shown.map((tree) => {
      const n = names(tree);
      return `<li><a class="card" href="#/tree/${tree.slug}">
        <img class="thumb" ${tree.thumb ? `src="${esc(tree.thumb)}"` : `data-thumb="${tree.slug}"`} alt="">
        <span>
          <span class="name">${esc(n.main)}</span><br>
          <span class="sub"><span class="sci">${esc(tree.scientific)}</span></span>
          ${tree.origin.startsWith('Introduced') ? '<span class="tag">Introduced</span>' : ''}
          ${tree.idAvailable ? '' : '<span class="tag warn">No photo ID</span>'}
        </span></a></li>`;
    }).join('') || '<li class="muted">No trees match that search.</li>';
    list.querySelectorAll('img[data-thumb]').forEach(async (img) => {
      const data = await getPhotos(trees.find((x) => x.slug === img.dataset.thumb));
      if (data?.photos[0]) img.src = data.photos[0].thumb;
    });
  };
  view.querySelector('.search').addEventListener('input', (e) => render(e.target.value));
  render('');
}

function fact(label, value) {
  return value ? `<div><dt>${label}</dt><dd>${esc(value)}</dd></div>` : '';
}

async function treePage(slug) {
  const tree = trees.find((t) => t.slug === slug);
  if (!tree) { view.innerHTML = '<p>That tree isn\'t in the app yet.</p><a href="#/">Back to trees</a>'; return; }
  const n = names(tree);
  const isWeed = tree.weed && !/^none/i.test(tree.weed);
  const title = `
    <header class="title">
      <h1>${esc(n.main)}</h1>
      <p class="sci-name">${esc(tree.scientific)}</p>
      ${n.alt ? `<p class="muted small">Also called ${esc(n.alt)}</p>` : ''}
      <p class="label">${esc(tree.family)} · ${esc(tree.origin)}</p>
      ${isWeed ? '<span class="badge weed">Weed</span>' : ''}
    </header>`;
  const plate = `
    <div class="plate${tree.hero ? ' has-hero' : ''}">
      <div id="photos"><div class="photo-empty">Loading photos…</div></div>
      <img class="motif" src="${motif(tree)}" alt="">
    </div>`;
  view.innerHTML = `
    <a class="back" href="#/">‹ All trees</a>
    ${tree.hero ? `<figure class="hero"><img src="${esc(tree.hero)}" alt="Botanical drawing of ${esc(n.main)}"></figure>${title}${plate}` : `${plate}${title}`}
    ${tree.idAvailable ? '' : `<div class="note"><strong>Not available for photo ID.</strong>
      Pl@ntNet doesn't recognise this tree yet, so use the ID tips below instead.</div>`}
    ${tree.plantnetCommon ? `<p class="muted small">Pl@ntNet calls this tree “${esc(tree.plantnetCommon)}”.</p>` : ''}
    <p>${esc(tree.description)}</p>
    ${isWeed ? `<div class="note weed"><strong>Weed status:</strong> ${esc(tree.weed)}</div>` : ''}
    <h2>How to spot it</h2>
    <dl class="facts">
      ${fact('Bark', tree.bark)}
      ${fact('Leaves', tree.leaves)}
      ${fact('Flowers', tree.flowers)}
      ${fact('Height', tree.height)}
    </dl>
    ${tree.confused ? `<div class="note confused"><div class="label">Don't mix it up with</div>${esc(tree.confused)}</div>` : ''}
    <h2>Where you'll see it</h2>
    <dl class="facts">
      ${fact('On a walk', tree.habitat)}
      ${fact('Where in NSW', tree.whereNSW)}
      ${fact('Range in Australia', tree.range)}
    </dl>
    ${tree.fact ? `<div class="fact"><div class="label">Little-known fact</div><p>${esc(tree.fact)}</p></div>` : ''}
    <h2>Good to know</h2>
    <dl class="facts">
      ${fact('Wildlife', tree.wildlife)}
      ${fact('Uses', tree.uses)}
    </dl>`;

  const box = view.querySelector('#photos');
  const data = await getPhotos(tree);
  if (!box.isConnected) return;
  if (!data || !data.photos.length) {
    box.innerHTML = '<div class="photo-empty">Photos show up when you\'re online.</div>';
    return;
  }
  box.innerHTML = `<div class="gallery">${data.photos.map((p) => `
      <figure><img src="${esc(p.src)}" alt="${esc(n.main)}" loading="lazy">
      <figcaption>${esc(p.credit)}</figcaption></figure>`).join('')}</div>
    ${data.source ? `<p class="source muted small">Photos from <a href="${esc(data.source)}" target="_blank" rel="noopener">iNaturalist</a>. Swipe for more.</p>` : ''}`;
}

function identifyPage() {
  const key = store.get(KEY_STORE);
  view.innerHTML = `
    <h1>Identify a tree</h1>
    <p class="muted">Take a photo or pick one from your photos. Leaves, bark, flowers and gumnuts all help, and you can add up to ${MAX_ID_PHOTOS} photos of the same tree.</p>
    ${key ? '' : `<div class="note">Add your Pl@ntNet key in <a href="#/settings">Settings</a> before you identify a tree.</div>`}
    <div class="stack">
      <label class="button" id="pick-label">
        Take or choose a photo
        <input type="file" accept="image/*" id="pick" hidden>
      </label>
      <div id="picked" class="stack"></div>
      <button class="button" id="go" ${idPhotos.length && key ? '' : 'disabled'}>Identify</button>
      <div id="results" class="stack" aria-live="polite"></div>
    </div>`;
  const renderPicked = () => {
    view.querySelector('#picked').innerHTML = idPhotos.map((p, i) => `
      <div class="preview">
        <img src="${p.url}" alt="Photo ${i + 1}">
        <fieldset class="organs"><legend>What does photo ${i + 1} show?</legend>
          ${ORGANS.map(([value, label]) => `<label><input type="radio" name="organ-${i}" value="${value}"
            ${p.organ === value ? 'checked' : ''} data-i="${i}">${label}</label>`).join('')}
        </fieldset>
        <button class="button secondary" data-remove="${i}">Remove photo ${i + 1}</button>
      </div>`).join('');
    view.querySelector('#go').disabled = !(idPhotos.length && store.get(KEY_STORE));
    view.querySelector('#pick-label').style.display = idPhotos.length >= MAX_ID_PHOTOS ? 'none' : '';
    view.querySelector('#pick-label').firstChild.textContent = idPhotos.length ? 'Add another photo ' : 'Take or choose a photo ';
  };
  view.querySelector('#pick').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    try {
      const blob = await shrink(file);
      idPhotos.push({ blob, url: URL.createObjectURL(blob), organ: 'auto' });
    } catch {
      view.querySelector('#results').innerHTML = '<div class="note">That photo couldn\'t be opened. Try a different one.</div>';
    }
    renderPicked();
  });
  view.querySelector('#picked').addEventListener('change', (e) => {
    if (e.target.dataset.i) idPhotos[e.target.dataset.i].organ = e.target.value;
  });
  view.querySelector('#picked').addEventListener('click', (e) => {
    const i = e.target.dataset.remove;
    if (i === undefined) return;
    URL.revokeObjectURL(idPhotos[i].url);
    idPhotos.splice(i, 1);
    renderPicked();
  });
  view.querySelector('#go').addEventListener('click', identify);
  renderPicked();
}

// Resizes a photo so uploads stay quick on a weak signal.
async function shrink(file, maxSide = 1600) {
  const img = new Image();
  const url = URL.createObjectURL(file);
  try {
    img.src = url;
    await img.decode();
  } finally {
    URL.revokeObjectURL(url);
  }
  const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(img.naturalWidth * scale);
  canvas.height = Math.round(img.naturalHeight * scale);
  canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject()), 'image/jpeg', 0.85));
}

async function identify() {
  const out = view.querySelector('#results');
  const go = view.querySelector('#go');
  const key = store.get(KEY_STORE);
  go.disabled = true;
  out.innerHTML = '<p class="status">Asking Pl@ntNet…</p>';

  const form = new FormData();
  idPhotos.forEach((p, i) => {
    form.append('images', p.blob, `photo-${i + 1}.jpg`);
    form.append('organs', p.organ);
  });
  const params = new URLSearchParams({ 'api-key': key, lang: 'en', 'nb-results': '5', 'include-related-images': 'false' });

  let res;
  try {
    res = await fetch(`${PLANTNET_URL}?${params}`, { method: 'POST', body: form });
  } catch {
    out.innerHTML = '<div class="note">Couldn\'t reach Pl@ntNet. Check you have mobile signal or wifi, then try again.</div>';
    go.disabled = false;
    return;
  }
  go.disabled = false;
  if (res.status === 404) {
    out.innerHTML = '<div class="note">Pl@ntNet couldn\'t match this photo to any plant. Try a closer, sharper photo of a leaf or the bark.</div>';
    return;
  }
  if (res.status === 401 || res.status === 403) {
    const reason = await res.json().then((b) => b.message || b.error).catch(() => '');
    out.innerHTML = `<div class="note">Pl@ntNet didn't accept your key. Check it in <a href="#/settings">Settings</a>,
      and check "expose my API key" is ticked and this app's address is under "Authorized domains" at my.plantnet.org.
      <br><br><span class="small">Pl@ntNet said: error ${res.status}${reason ? `, “${esc(reason)}”` : ''}</span></div>`;
    return;
  }
  if (res.status === 429) {
    out.innerHTML = '<div class="note">You\'ve used today\'s free Pl@ntNet identifications. Try again tomorrow.</div>';
    return;
  }
  if (!res.ok) {
    out.innerHTML = `<div class="note">Pl@ntNet had a problem (error ${res.status}). Try again in a minute.</div>`;
    return;
  }
  const data = await res.json();
  if (typeof data.remainingIdentificationRequests === 'number') {
    store.set('plantnetRemaining', String(data.remainingIdentificationRequests));
  }
  showResults(out, data.results || []);
}

function showResults(out, results) {
  if (!results.length) {
    out.innerHTML = '<div class="note">No match. Try a closer photo of a leaf or the bark.</div>';
    return;
  }
  const top = results[0].score;
  const html = results.map((r) => {
    const sci = r.species.scientificNameWithoutAuthor;
    const common = (r.species.commonNames || [])[0];
    const tree = findTree(sci);
    const pct = Math.round(r.score * 100);
    let link = '<p class="muted small">Not one of your 50 trees.</p>';
    if (tree?.ready) link = `<a class="button" href="#/tree/${tree.slug}">Open ${esc(names(tree).main)}</a>`;
    else if (tree) link = `<p class="small"><strong>${esc(names(tree).main)}</strong> is on your list. Its page is coming soon.</p>`;
    return `<div class="result ${tree ? 'match' : ''}">
      <span class="score">${pct}%</span>
      <strong>${esc(common || sci)}</strong><br>
      <span class="sci small">${esc(sci)}</span>
      <div class="bar"><span style="width:${pct}%"></span></div>
      ${link}
    </div>`;
  }).join('');
  const unsure = top < 0.2
    ? '<div class="note">Pl@ntNet isn\'t confident about this one. Adding a photo of a leaf and one of the bark usually helps.</div>'
    : '';
  out.innerHTML = `<h2>Best matches</h2>${unsure}${html}`;
  out.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function settingsPage() {
  const key = store.get(KEY_STORE);
  const remaining = store.get('plantnetRemaining');
  view.innerHTML = `
    <h1>Settings</h1>
    <div class="stack">
      <label class="field" for="key">Pl@ntNet key</label>
      <p class="muted small">Your key stays on this phone. It's only ever sent to Pl@ntNet when you identify a tree.</p>
      <input class="text" id="key" type="password" autocomplete="off" autocapitalize="off" spellcheck="false"
        placeholder="${key ? 'Key saved' : 'Paste your key here'}">
      <button class="button" id="save">Save key</button>
      ${key ? '<button class="button secondary" id="clear">Remove saved key</button>' : ''}
      <p class="status" id="msg" aria-live="polite">${key
        ? `A key is saved on this phone. It's ${key.length} characters long and ends in <strong>${esc(key.slice(-4))}</strong>.`
        : 'No key saved yet.'}</p>
      ${remaining ? `<p class="muted small">Pl@ntNet identifications left today: ${esc(remaining)}</p>` : ''}
    </div>
    <h2>Photos</h2>
    <p class="muted small">Tree photos are kept on this phone so they load quickly on the track.</p>
    <button class="button secondary" id="refresh">Refresh tree photos</button>
    <h2>About</h2>
    <p class="muted small">NSW Trees, first ${trees.filter((t) => t.ready).length} of ${trees.length} trees. Tree notes updated ${esc(window.treeDataUpdated)}.
      Photo ID by <a href="https://plantnet.org" target="_blank" rel="noopener">Pl@ntNet</a>.</p>`;
  const msg = view.querySelector('#msg');
  view.querySelector('#save').addEventListener('click', () => {
    // Drop spaces, line breaks and quote marks that can come along when copying.
    const value = view.querySelector('#key').value.replace(/[\s"'“”‘’]/g, '');
    if (!value) { msg.textContent = 'Paste your key into the box first.'; return; }
    store.set(KEY_STORE, value);
    settingsPage();
    const saved = view.querySelector('#msg');
    saved.innerHTML = `Key saved. You're ready to identify trees. ${saved.innerHTML.replace('A key is saved on this phone. ', '')}`;
  });
  view.querySelector('#clear')?.addEventListener('click', () => {
    store.remove(KEY_STORE);
    settingsPage();
  });
  view.querySelector('#refresh').addEventListener('click', () => {
    trees.forEach((t) => store.remove(`photos:v1:${t.slug}`));
    msg.textContent = '';
    view.querySelector('#refresh').textContent = 'Photos will refresh next time you open each tree';
  });
}

// ---------- routing ----------

function route() {
  const hash = location.hash.replace(/^#/, '') || '/';
  const [, page, arg] = hash.split('/');
  const tab = page === 'identify' ? 'identify' : page === 'settings' ? 'settings' : 'trees';
  document.querySelectorAll('.tabs a').forEach((a) => {
    if (a.dataset.tab === tab) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  });
  if (page === 'tree') treePage(arg);
  else if (page === 'identify') identifyPage();
  else if (page === 'settings') settingsPage();
  else treeList();
  window.scrollTo(0, 0);
}

async function start() {
  try {
    const data = await fetch('data/trees.json').then((r) => r.json());
    trees = data.trees;
    window.treeDataUpdated = data.updated;
  } catch {
    view.innerHTML = '<p>The tree list couldn\'t load. Check your connection and reopen the app.</p>';
    return;
  }
  window.addEventListener('hashchange', route);
  route();
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
}

start();
