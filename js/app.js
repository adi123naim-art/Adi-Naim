(function () {
  'use strict';

  var items = Array.isArray(window.ITEMS) ? window.ITEMS : [];
  var wall = document.getElementById('wall');
  var backdrop = document.getElementById('backdrop');
  var closeBtn = document.getElementById('closeBtn');
  var flipBtn = document.getElementById('flipBtn');
  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)');

  var TAPE_COLORS = ['rgba(232,215,170,.76)'];
  var PH_COLORS = ['#cfcac0', '#c6c9c5', '#d5cfc3', '#c9c4bd'];
  var ICONS = {
    image: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8.5" cy="9.5" r="1.5"/><path d="m21 15-4.5-4.5L7 20"/></svg>',
    video: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="m10 9 5 3-5 3z"/></svg>'
  };
  var FLIP_KEYFRAMES = [
    { transform: 'rotateX(0deg) rotateY(0deg)' },
    { transform: 'rotateX(16deg) rotateY(90deg)' },
    { transform: 'rotateX(0deg) rotateY(180deg)' }
  ];

  var slots = [];
  var columnCount = 0;
  var current = null;
  var busy = false;

  function durations() {
    return reduced.matches ? { peel: 0, fly: 220 } : { peel: 300, fly: 800 };
  }
  function wait(ms) {
    return new Promise(function (resolve) { setTimeout(resolve, ms); });
  }
  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  // מחולל אקראיות קבוע לפי id, כדי שהקיר ייראה אותו דבר בכל טעינה
  function seededRandom(str) {
    var h = 1779033703 ^ str.length;
    for (var i = 0; i < str.length; i++) {
      h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
      h = (h << 13) | (h >>> 19);
    }
    return function () {
      h = Math.imul(h ^ (h >>> 16), 2246822507);
      h = Math.imul(h ^ (h >>> 13), 3266489909);
      h ^= h >>> 16;
      return (h >>> 0) / 4294967296;
    };
  }

  function parseAspect(value) {
    if (typeof value === 'number' && value > 0) return value;
    if (typeof value === 'string') {
      var m = value.match(/^\s*([\d.]+)\s*[\/:]\s*([\d.]+)\s*$/);
      if (m && +m[2] > 0) return +m[1] / +m[2];
      var n = parseFloat(value);
      if (n > 0) return n;
    }
    return null;
  }

  function addTape(card, x, y, angle, rand) {
    var tape = el('div', 'tape');
    tape.style.left = x + '%';
    tape.style.top = y + '%';
    tape.style.setProperty('--tr', angle.toFixed(1) + 'deg');
    tape.style.setProperty('--tc', TAPE_COLORS[Math.floor(rand() * TAPE_COLORS.length)]);
    tape.style.setProperty('--fx', Math.round((rand() - .5) * 140) + 'px');
    tape.style.setProperty('--spin', Math.round((rand() - .5) * 110) + 'deg');
    card.appendChild(tape);
  }

  function addTapes(card, rand) {
    var jitter = function (range) { return (rand() - .5) * 2 * range; };
    var variant = Math.floor(rand() * 4);
    if (variant === 0) {
      addTape(card, 50 + jitter(18), 0, jitter(7), rand);
    } else if (variant === 1) {
      if (rand() < .5) addTape(card, 5, 3, -42 + jitter(9), rand);
      else addTape(card, 95, 3, 42 + jitter(9), rand);
    } else if (variant === 2) {
      addTape(card, 5, 3, -42 + jitter(9), rand);
      addTape(card, 95, 3, 42 + jitter(9), rand);
    } else {
      addTape(card, 5, 3, -42 + jitter(9), rand);
      addTape(card, 95, 97, -42 + jitter(9), rand);
    }
  }

  function buildFront(item, slot, index) {
    var front = el('div', 'face front');
    var hasAspect = parseAspect(item.aspectRatio) !== null;

    if (item.type === 'image' && item.src) {
      var img = el('img', 'media');
      img.src = item.src;
      img.alt = item.alt || '';
      img.loading = 'lazy';
      img.decoding = 'async';
      if (!hasAspect) img.addEventListener('load', function () {
        if (img.naturalWidth) slot.style.setProperty('--ar', img.naturalWidth / img.naturalHeight);
      });
      front.appendChild(img);
    } else if (item.type === 'video' && item.src) {
      var video = el('video', 'media');
      video.muted = true;
      video.defaultMuted = true;
      video.loop = true;
      video.playsInline = true;
      video.setAttribute('muted', '');
      video.setAttribute('playsinline', '');
      video.preload = 'metadata';
      if (item.poster) video.poster = item.poster;
      if (item.alt) video.setAttribute('aria-label', item.alt);
      if (!reduced.matches) video.autoplay = true;
      video.src = item.src;
      if (!hasAspect) video.addEventListener('loadedmetadata', function () {
        if (video.videoWidth) slot.style.setProperty('--ar', video.videoWidth / video.videoHeight);
      });
      front.appendChild(video);
    } else {
      var ph = el('div', 'ph');
      ph.style.setProperty('--ph', PH_COLORS[index % PH_COLORS.length]);
      ph.innerHTML = ICONS[item.icon === 'video' ? 'video' : 'image'];
      ph.appendChild(el('span', '', 'בקרוב'));
      ph.setAttribute('role', 'img');
      ph.setAttribute('aria-label', item.alt || 'מקום שמור לתוצר');
      front.appendChild(ph);
    }
    return front;
  }

  function buildBack(item) {
    var back = el('div', 'face back');
    var note = el('div', 'note');

    var tool = el('section');
    tool.appendChild(el('h3', '', 'הכלי'));
    tool.appendChild(el('p', 'tool', item.tool || ''));

    var prompt = el('section', 'prompt-box no-flip');
    var head = el('div', 'prompt-head');
    head.appendChild(el('h3', '', 'הפרומפט'));
    var copy = el('button', 'copy', 'העתק');
    copy.type = 'button';
    head.appendChild(copy);
    var pre = el('pre', 'prompt', item.prompt || '');
    pre.dir = 'auto';
    pre.tabIndex = 0;
    prompt.appendChild(head);
    prompt.appendChild(pre);
    copy.addEventListener('click', function () {
      copyText(item.prompt || '').then(function (ok) {
        copy.textContent = ok ? 'הועתק ✓' : 'ההעתקה נכשלה';
        setTimeout(function () { copy.textContent = 'העתק'; }, 1800);
      });
    });

    var process = el('section');
    process.appendChild(el('h3', '', 'תהליך העבודה'));
    process.appendChild(el('p', '', item.process || ''));

    note.appendChild(tool);
    note.appendChild(prompt);
    note.appendChild(process);
    note.appendChild(el('p', 'hint', 'לחיצה על הכרטיס הופכת אותו'));
    back.appendChild(note);
    back.inert = true;
    return back;
  }

  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text).then(function () { return true; }, function () { return legacyCopy(text); });
    }
    return Promise.resolve(legacyCopy(text));
  }
  function legacyCopy(text) {
    var ta = el('textarea');
    ta.value = text;
    ta.style.cssText = 'position:fixed;opacity:0;top:0;left:0';
    document.body.appendChild(ta);
    ta.select();
    var ok = false;
    try { ok = document.execCommand('copy'); } catch (e) { /* נשאר false */ }
    ta.remove();
    return ok;
  }

  function buildSlot(item, index) {
    var id = String(item.id != null ? item.id : index);
    var rand = seededRandom(id);
    var aspect = parseAspect(item.aspectRatio) || 1;

    var slot = el('div', 'slot');
    slot.style.setProperty('--ar', aspect);
    slot._aspect = aspect;

    var card = el('div', 'card');
    card._rot = (rand() - .5) * 6;
    card._dx = (rand() - .5) * 12;
    card._dy = (rand() - .5) * 12;
    card._label = item.alt || 'תוצר ' + (index + 1);
    card.style.setProperty('--rot', card._rot.toFixed(2) + 'deg');
    card.style.setProperty('--dx', card._dx.toFixed(1) + 'px');
    card.style.setProperty('--dy', card._dy.toFixed(1) + 'px');
    setWallRole(card);

    var inner = el('div', 'card-inner');
    inner.appendChild(buildFront(item, slot, index));
    card._back = buildBack(item);
    inner.appendChild(card._back);
    card._inner = inner;
    card._slot = slot;
    card._video = inner.querySelector('video');

    card.appendChild(inner);
    addTapes(card, rand);

    card.addEventListener('click', function (e) {
      if (current !== card) { open(card); return; }
      if (e.target.closest('.no-flip, video, button, a')) return;
      if (String(window.getSelection())) return;
      flip();
    });
    card.addEventListener('keydown', function (e) {
      if (e.target !== card || current) return;
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(card); }
    });

    slot.appendChild(card);
    return slot;
  }

  function setWallRole(card) {
    card.setAttribute('role', 'button');
    card.tabIndex = 0;
    card.setAttribute('aria-label', 'פתיחת תוצר: ' + card._label);
    card.removeAttribute('aria-modal');
  }

  /* ---------- פריסה בעמודות ---------- */

  function layout() {
    var width = window.innerWidth;
    var n = width < 560 ? 2 : width < 900 ? 3 : 4;
    n = Math.min(n, Math.max(1, slots.length));
    if (n === columnCount) return;
    columnCount = n;

    var cols = [], heights = [];
    for (var i = 0; i < n; i++) { cols.push(el('div', 'col')); heights.push(0); }
    slots.forEach(function (slot) {
      var shortest = heights.indexOf(Math.min.apply(null, heights));
      cols[shortest].appendChild(slot);
      heights[shortest] += 1 / slot._aspect + .12;
    });
    wall.replaceChildren.apply(wall, cols);

    // העברה ב-DOM עוצרת סרטונים
    if (!reduced.matches) wall.querySelectorAll('video').forEach(function (v) {
      if (v.muted) v.play().catch(function () {});
    });
  }

  /* ---------- פתיחה, היפוך, סגירה ---------- */

  function geometry(card) {
    var r = card._slot.getBoundingClientRect();
    var vw = document.documentElement.clientWidth;
    var vh = window.innerHeight;
    var aspect = r.width / r.height;
    var w = Math.min(vw * .92, 1000, vh * .78 * aspect);
    var h = w / aspect;
    return {
      left: (vw - w) / 2, top: (vh - h) / 2, w: w, h: h,
      bw: Math.max(w, Math.min(vw * .92, 400)),
      bh: Math.max(h, Math.min(vh * .76, 500)),
      wallTransform: 'translate(' + (r.left + r.width / 2 - vw / 2 + card._dx) + 'px,' +
        (r.top + r.height / 2 - vh / 2 + card._dy) + 'px) rotate(' + card._rot + 'deg) scale(' + (r.width / w) + ')'
    };
  }

  function applyBox(card, g) {
    card.style.left = g.left + 'px';
    card.style.top = g.top + 'px';
    card.style.width = g.w + 'px';
    card.style.height = g.h + 'px';
    card.style.setProperty('--bw', g.bw + 'px');
    card.style.setProperty('--bh', g.bh + 'px');
  }

  function syncFace(card) {
    var showingBack = card._inner.classList.contains('flipped');
    card._back.inert = !showingBack;
    if (card._video) {
      card._video.controls = !showingBack;
      if (showingBack && !card._video.muted) card._video.pause();
    }
  }

  async function open(card) {
    if (busy || current) return;
    busy = true;
    current = card;
    var d = durations();

    card.classList.add('peeling');
    await wait(d.peel);

    var g = geometry(card);
    card.style.transition = 'none';
    card.classList.add('lifted');
    applyBox(card, g);
    card.style.transform = reduced.matches ? 'none' : g.wallTransform;
    if (reduced.matches) card.style.opacity = '0';
    void card.offsetWidth;

    card.style.transition = 'transform ' + d.fly + 'ms cubic-bezier(.22,.9,.24,1), opacity ' + d.fly + 'ms ease';
    card.style.transform = 'none';
    card.style.opacity = '1';
    card._inner.classList.add('flipped');
    if (!reduced.matches) card._inner.animate(FLIP_KEYFRAMES, { duration: d.fly, easing: 'cubic-bezier(.3,.7,.2,1)' });

    backdrop.classList.add('show');
    closeBtn.hidden = false;
    flipBtn.hidden = false;
    document.documentElement.classList.add('locked');

    await wait(d.fly);
    card.classList.add('settled');
    card.setAttribute('role', 'dialog');
    card.setAttribute('aria-modal', 'true');
    card.setAttribute('aria-label', card._label);
    card.tabIndex = -1;
    syncFace(card);
    closeBtn.focus();
    busy = false;
  }

  function flip() {
    if (busy || !current) return;
    current._inner.classList.toggle('flipped');
    syncFace(current);
  }

  async function close() {
    if (busy || !current) return;
    busy = true;
    var card = current;
    var d = durations();
    var wasFlipped = card._inner.classList.contains('flipped');

    card.classList.remove('settled');
    card._back.inert = true;
    if (card._video) {
      card._video.controls = false;
      card._video.muted = true;
      if (!reduced.matches) card._video.play().catch(function () {});
    }
    backdrop.classList.remove('show');
    closeBtn.hidden = true;
    flipBtn.hidden = true;

    if (reduced.matches) {
      card.style.opacity = '0';
    } else {
      card.style.transform = geometry(card).wallTransform;
      if (wasFlipped) {
        card._inner.animate(FLIP_KEYFRAMES.slice().reverse(), { duration: d.fly, easing: 'cubic-bezier(.3,.7,.2,1)' });
      }
    }
    card._inner.classList.remove('flipped');
    await wait(d.fly);

    // חזרה לקיר בלי שהמעבר של hover יקפיץ את הכרטיס
    card.style.transition = 'none';
    card.classList.remove('lifted', 'peeling');
    ['left', 'top', 'width', 'height', 'transform', 'opacity', '--bw', '--bh'].forEach(function (p) {
      card.style.removeProperty(p);
    });
    void card.offsetWidth;
    card.style.removeProperty('transition');
    card.classList.add('sticking');
    setTimeout(function () { card.classList.remove('sticking'); }, 320);

    document.documentElement.classList.remove('locked');
    setWallRole(card);
    card.focus({ preventScroll: true });
    current = null;
    busy = false;
  }

  function focusables() {
    var inCard = Array.prototype.slice.call(current.querySelectorAll('button, [tabindex="0"], video[controls]'))
      .filter(function (node) { return !node.closest('[inert]'); });
    return [closeBtn, flipBtn].concat(inCard);
  }

  document.addEventListener('keydown', function (e) {
    if (!current) return;
    if (e.key === 'Escape') { e.preventDefault(); close(); return; }
    if (e.key !== 'Tab') return;
    e.preventDefault();
    var list = focusables();
    var i = list.indexOf(document.activeElement);
    var next = e.shiftKey ? (i <= 0 ? list.length - 1 : i - 1) : (i + 1) % list.length;
    list[next].focus();
  });

  backdrop.addEventListener('click', close);
  closeBtn.addEventListener('click', close);
  flipBtn.addEventListener('click', flip);

  window.addEventListener('resize', function () {
    layout();
    if (current && !busy) applyBox(current, geometry(current));
  });

  /* ---------- התחלה ---------- */

  if (!items.length) {
    wall.appendChild(el('p', 'empty', 'עדיין אין תוצרים להצגה. אפשר להוסיף אותם בקובץ data/items.js.'));
  } else {
    slots = items.map(buildSlot);
    layout();
  }
})();
