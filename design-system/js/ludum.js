/* @ds-bundle: {"format":4,"namespace":"Ludum","components":[{"name":"Wordmark"},{"name":"SiteNav"},{"name":"Footer"},{"name":"Tabs"},{"name":"Button"},{"name":"TextLink"},{"name":"PlayAction"},{"name":"PlayBand"},{"name":"StatusStamp"},{"name":"SectionHead"},{"name":"MetadataStrip"},{"name":"Statement"},{"name":"NoteEntry"},{"name":"PullQuote"},{"name":"Figure"},{"name":"Collage"},{"name":"ArticleHead"},{"name":"Prose"},{"name":"NextNote"},{"name":"ProjectMasthead"},{"name":"MechanicsStack"},{"name":"ProjectFeature"},{"name":"CatalogueEntry"},{"name":"DeparturesBoard"},{"name":"RouteMap"},{"name":"Ledger"},{"name":"Certificate"},{"name":"GamePieces"}]} */
/* Ludum · a small vanilla enhancer for the static site. Call Ludum.enhance() once the page has loaded.
   Without it every page still reads and works: menus show as rows, filters show everything, nothing is hidden for a reveal. */
(function () {
  'use strict';
  var Ludum = window.Ludum || {};
  var reduce = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };
  var ICONS = {
 "arrow-right": "<path d=\"M3 12h17M14 6l6 6-6 6\"/>",
 "arrow-left": "<path d=\"M21 12H4M10 6l-6 6 6 6\"/>",
 "arrow-down": "<path d=\"M12 3v17M6 14l6 6 6-6\"/>",
 "arrow-out": "<path d=\"M6 18 18 6M8 6h10v10\"/>",
 "plus": "<path d=\"M12 4v16M4 12h16\"/>",
 "minus": "<path d=\"M4 12h16\"/>",
 "close": "<path d=\"m5 5 14 14M19 5 5 19\"/>",
 "menu": "<path d=\"M3 8h18M3 16h18\"/>",
 "hex": "<path d=\"M7.5 3.5h9L21 12l-4.5 8.5h-9L3 12z\"/>",
 "station": "<circle cx=\"12\" cy=\"12\" r=\"7\"/><circle class=\"ld-icon__fill\" cx=\"12\" cy=\"12\" r=\"2.5\"/>",
 "hub": "<circle cx=\"12\" cy=\"12\" r=\"9.5\"/><circle class=\"ld-icon__fill\" cx=\"12\" cy=\"12\" r=\"5\"/>",
 "route": "<path d=\"M3.5 18.5 9 8l6 8 5.5-10.5\"/><rect class=\"ld-icon__fill\" x=\"7\" y=\"6\" width=\"4\" height=\"4\"/><rect class=\"ld-icon__fill\" x=\"13\" y=\"14\" width=\"4\" height=\"4\"/>",
 "network": "<path d=\"M6 6.5 18 8.5M6 6.5l6 11M18 8.5l-6 9\"/><circle class=\"ld-icon__fill\" cx=\"6\" cy=\"6.5\" r=\"3\"/><circle class=\"ld-icon__fill\" cx=\"18\" cy=\"8.5\" r=\"3\"/><circle class=\"ld-icon__fill\" cx=\"12\" cy=\"17.5\" r=\"3\"/>",
 "train": "<path d=\"M3 16.5V9.5h10V5h7v11.5H3zM6.5 9.5V6M2 21h20\"/><circle cx=\"7\" cy=\"18.5\" r=\"1.8\"/><circle cx=\"16.5\" cy=\"18.5\" r=\"1.8\"/>",
 "share": "<path d=\"M3 5h18v14H3z\"/><path d=\"M6.5 8.5h11v7h-11z\"/><path d=\"M9 12h6\"/>",
 "token": "<ellipse cx=\"12\" cy=\"8\" rx=\"8\" ry=\"3.5\"/><path d=\"M4 8v7.5c0 1.9 3.6 3.5 8 3.5s8-1.6 8-3.5V8\"/>",
 "epoch": "<circle cx=\"12\" cy=\"12\" r=\"9\"/><path d=\"M12 6.5V12l3.5 3.5\"/>",
 "govern": "<path d=\"M3 20.5h18M5 17.5h14M6.5 10.5v7M10 10.5v7M14 10.5v7M17.5 10.5v7M3 10.5 12 4l9 6.5z\"/>",
 "note": "<path d=\"M6 3h9l4 4v14H6z\"/><path d=\"M14.5 3v5h4.5M9 12.5h7M9 16.5h7\"/>",
 "star": "<path class=\"ld-icon__fill\" d=\"M12 1.5 13.6 10.4 22.5 12l-8.9 1.6L12 22.5l-1.6-8.9L1.5 12l8.9-1.6z\"/>",
 "target": "<circle cx=\"12\" cy=\"12\" r=\"9\"/><circle class=\"ld-icon__fill\" cx=\"12\" cy=\"12\" r=\"3\"/><path d=\"M12 1v4M12 19v4M1 12h4M19 12h4\"/>",
 "rust": "<path d=\"M4 16.5V9.5h9V5.5h6.5v11H4z\"/><path d=\"M2 20.5h20\" stroke-dasharray=\"3 2.5\"/><path d=\"m7 2.5 2 3M12 1.5l1 3\"/>"
};

  /* Icons: 24px, 2px square-capped strokes on currentColor. Ludum.icon('arrow-out', 'ld-icon--20') → '<svg …>'. */
  Ludum.icons = ICONS;
  Ludum.icon = function (name, cls, label) {
    var body = ICONS[name] || '';
    var a11y = label ? ' role="img" aria-label="' + String(label).replace(/"/g, '&quot;') + '"' : ' aria-hidden="true" focusable="false"';
    return '<svg class="ld-icon' + (cls ? ' ' + cls : '') + '" viewBox="0 0 24 24"' + a11y + '>' + body + '</svg>';
  };

  function each(root, sel, fn) { Array.prototype.forEach.call(root.querySelectorAll(sel), fn); }
  function once(el, key) { if (el.hasAttribute('data-ld-' + key + '-ready')) return false; el.setAttribute('data-ld-' + key + '-ready', ''); return true; }

  /* Reveal: [data-ld-reveal] prints in once (a wipe from the left; "up" wipes from below) as it enters the view. */
  function reveals(root) {
    var els = root.querySelectorAll('[data-ld-reveal]:not(.is-in)');
    if (!els.length) return;
    if (reduce.matches || !('IntersectionObserver' in window)) { each(root, '[data-ld-reveal]', function (el) { el.classList.add('is-in'); }); return; }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target); } });
    }, { threshold: 0, rootMargin: '0px 0px -8% 0px' });   // threshold 0: a clipped target has no area until it is revealed
    Array.prototype.forEach.call(els, function (el) { io.observe(el); });
  }

  /* Draw: inside [data-ld-draw], solid routes draw themselves once, in order of their data-ld-order (or document order). */
  function draws(root) {
    each(root, '[data-ld-draw]', function (box) {
      if (!once(box, 'draw')) return;
      var paths = box.querySelectorAll('.ld-route:not(.ld-route--proposed):not(.ld-route--link-core), .ld-track');
      if (reduce.matches || !('IntersectionObserver' in window) || !paths.length) return;
      Array.prototype.forEach.call(paths, function (p, i) {
        var len = 0; try { len = p.getTotalLength(); } catch (e) { return; }
        p.style.strokeDasharray = len + ' ' + len; p.style.strokeDashoffset = String(len);
        p.style.transition = 'stroke-dashoffset var(--dur-draw, 1200ms) var(--ease-press, cubic-bezier(.7,0,.2,1)) ' + (i * 70) + 'ms';
      });
      var io = new IntersectionObserver(function (entries) {
        if (!entries[0].isIntersecting) return;
        io.disconnect();
        Array.prototype.forEach.call(paths, function (p) {
          p.style.strokeDashoffset = '0';
          p.addEventListener('transitionend', function done() { p.style.strokeDasharray = ''; p.style.strokeDashoffset = ''; p.style.transition = ''; p.removeEventListener('transitionend', done); });
        });
      }, { threshold: 0.2 });
      io.observe(box);
    });
  }

  /* The nav's Menu: a full black sheet on phones. Escape or a second press closes it; focus returns to the button. */
  function menus(root) {
    each(root, '.ld-nav', function (nav) {
      var btn = nav.querySelector('.ld-nav__menu'), panel = nav.querySelector('.ld-nav__links');
      if (!btn || !panel || !once(nav, 'menu')) return;
      function set(open) {
        nav.classList.toggle('is-open', open);
        btn.setAttribute('aria-expanded', open ? 'true' : 'false');
        btn.querySelector('.ld-nav__menu-word') && (btn.querySelector('.ld-nav__menu-word').textContent = open ? 'Close' : 'Menu');
        if (open) { var first = panel.querySelector('a'); first && first.focus(); }
      }
      btn.addEventListener('click', function () { set(!nav.classList.contains('is-open')); });
      nav.addEventListener('keydown', function (e) { if (e.key === 'Escape' && nav.classList.contains('is-open')) { set(false); btn.focus(); } });
      panel.addEventListener('click', function (e) { if (e.target.closest('a')) set(false); });
    });
  }

  /* Tabs with panels: [data-ld-tabs] holding [role=tab] buttons, each aria-controls its panel. Arrows, Home and End move along. */
  function tabs(root) {
    each(root, '[data-ld-tabs]', function (list) {
      if (!once(list, 'tabs')) return;
      var tabs = Array.prototype.slice.call(list.querySelectorAll('[role="tab"]'));
      function select(t, focus) {
        tabs.forEach(function (x) {
          var on = x === t; x.setAttribute('aria-selected', on ? 'true' : 'false'); x.tabIndex = on ? 0 : -1;
          var p = document.getElementById(x.getAttribute('aria-controls')); if (p) p.hidden = !on;
        });
        if (focus) t.focus();
      }
      tabs.forEach(function (t, i) {
        t.addEventListener('click', function () { select(t); });
        t.addEventListener('keydown', function (e) {
          var j = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: tabs.length - 1 }[e.key];
          if (j === undefined) return; e.preventDefault(); select(tabs[(j + tabs.length) % tabs.length], true);
        });
      });
      select(tabs.filter(function (t) { return t.getAttribute('aria-selected') === 'true'; })[0] || tabs[0]);
    });
  }

  /* Filters: [data-ld-filter="<list id>"] buttons with data-value narrow a list's items by their data-ld-status. */
  function filters(root) {
    each(root, '[data-ld-filter]', function (group) {
      if (!once(group, 'filter')) return;
      var list = document.getElementById(group.getAttribute('data-ld-filter'));
      if (!list) return;
      var btns = group.querySelectorAll('button[data-value]');
      var count = document.querySelector('[data-ld-filter-count="' + list.id + '"]');
      var empty = document.querySelector('[data-ld-filter-empty="' + list.id + '"]');
      Array.prototype.forEach.call(btns, function (b) {
        b.addEventListener('click', function () {
          var v = b.getAttribute('data-value'), n = 0;
          Array.prototype.forEach.call(btns, function (x) { x.setAttribute('aria-pressed', x === b ? 'true' : 'false'); });
          Array.prototype.forEach.call(list.children, function (li) {
            var show = v === 'all' || (li.getAttribute('data-ld-status') || '').split(' ').indexOf(v) > -1;
            li.hidden = !show; if (show) n++;
          });
          if (count) count.textContent = n + (n === 1 ? ' project' : ' projects');
          if (empty) empty.hidden = n > 0;
        });
      });
    });
  }

  /* Trace: on a route map, pointing at (or focusing) a station lights its routes and the stations they reach. */
  function traces(root) {
    each(root, '[data-ld-trace]', function (map) {
      if (!once(map, 'trace')) return;
      var routes = map.querySelectorAll('[data-ld-ends]'), nodes = map.querySelectorAll('[data-ld-node]');
      function light(id) {
        var lit = {}; lit[id] = true;
        Array.prototype.forEach.call(routes, function (r) {
          var ends = r.getAttribute('data-ld-ends').split(' ');
          var on = ends.indexOf(id) > -1; r.classList.toggle('is-lit', on);
          if (on) ends.forEach(function (e) { lit[e] = true; });
        });
        Array.prototype.forEach.call(nodes, function (n) { n.classList.toggle('is-lit', !!lit[n.getAttribute('data-ld-node')]); });
        map.classList.add('is-tracing');
      }
      function clear() { map.classList.remove('is-tracing'); each(map, '.is-lit', function (x) { x.classList.remove('is-lit'); }); }
      Array.prototype.forEach.call(nodes, function (n) {
        var id = n.getAttribute('data-ld-node');
        n.addEventListener('pointerenter', function () { light(id); });
        n.addEventListener('pointerleave', clear);
        n.addEventListener('focus', function () { light(id); });
        n.addEventListener('blur', clear);
      });
    });
  }

  Ludum.enhance = function (root) {
    root = root || document;
    var html = document.documentElement;
    html.classList.add('ld-js');
    html.classList.toggle('ld-motion', !reduce.matches);
    menus(root); tabs(root); filters(root); traces(root); draws(root); reveals(root);
    return Ludum;
  };

  window.Ludum = Ludum;
})();
