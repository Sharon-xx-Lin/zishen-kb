/* 站内搜索：标题 / 简介匹配 + 章节全文匹配 */
(function () {
  var input = document.getElementById('search-input');
  var box = document.getElementById('search-results');
  if (!input || !box) return;
  var DATA = null, base = '';

  // 页面在子目录时，索引里的相对路径需要补 ../
  base = document.location.pathname.indexOf('/chapters/') !== -1 ||
         document.location.pathname.indexOf('/concepts/') !== -1 ||
         document.location.pathname.indexOf('/cases/') !== -1 ||
         document.location.pathname.indexOf('/people/') !== -1 ||
         document.location.pathname.indexOf('/indexes/') !== -1 ? '../' : '';

  function esc(s) { return s.replace(/&/g, '&amp;').replace(/</g, '&lt;'); }

  function mark(text, q) {
    var i = text.toLowerCase().indexOf(q.toLowerCase());
    if (i === -1) return esc(text);
    return esc(text.slice(0, i)) + '<mark>' + esc(text.slice(i, i + q.length)) + '</mark>' + esc(text.slice(i + q.length));
  }

  function bodySnippet(item, q) {
    if (!item.b) return null;
    var i = item.b.toLowerCase().indexOf(q.toLowerCase());
    if (i === -1) return null;
    var st = Math.max(0, i - 30), ed = Math.min(item.b.length, i + q.length + 50);
    return (st > 0 ? '…' : '') + item.b.slice(st, ed) + '…';
  }

  function render(q) {
    if (!DATA) return;
    q = q.trim();
    if (!q) { box.style.display = 'none'; return; }
    var ql = q.toLowerCase();
    var hits = [];
    DATA.forEach(function (it) {
      var tl = it.t.toLowerCase(), sl = (it.s || '').toLowerCase();
      if (tl.indexOf(ql) !== -1 || sl.indexOf(ql) !== -1) {
        hits.push({ it: it, kind: 'title', score: (tl.indexOf(ql) === 0 ? 3 : (tl.indexOf(ql) !== -1 ? 2 : 1)) });
      } else if (it.b && it.b.toLowerCase().indexOf(ql) !== -1) {
        hits.push({ it: it, kind: 'body', score: 0.5 });
      }
    });
    hits.sort(function (a, b) { return b.score - a.score; });
    hits = hits.slice(0, 12);
    if (!hits.length) {
      box.innerHTML = '<div class="sr-empty">没有找到与「' + esc(q) + '」相关的条目</div>';
      box.style.display = 'block';
      return;
    }
    box.innerHTML = hits.map(function (h) {
      var snip = h.kind === 'body' ? bodySnippet(h.it, q) : (h.it.s || '');
      return '<a class="sr-item" href="' + base + h.it.u + '">' +
        '<span class="sr-title">' + mark(h.it.t, q) + '</span>' +
        '<span class="sr-type">' + h.it.ty + (h.kind === 'body' ? ' · 正文' : '') + '</span>' +
        '<span class="sr-snippet">' + (snip ? mark(snip, q) : '') + '</span></a>';
    }).join('');
    box.style.display = 'block';
  }

  var tmr = null;
  input.addEventListener('input', function () {
    clearTimeout(tmr);
    tmr = setTimeout(function () { render(input.value); }, 120);
  });
  input.addEventListener('focus', function () { if (input.value.trim()) render(input.value); });
  document.addEventListener('keydown', function (e) {
    if (e.key === '/' && document.activeElement !== input) { e.preventDefault(); input.focus(); }
    if (e.key === 'Escape') { box.style.display = 'none'; input.blur(); }
  });
  document.addEventListener('click', function (e) {
    if (!box.contains(e.target) && e.target !== input) box.style.display = 'none';
  });

  fetch(base + 'search-index.json').then(function (r) { return r.json(); }).then(function (d) { DATA = d; });
})();
