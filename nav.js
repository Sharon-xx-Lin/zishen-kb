/* 侧边栏折叠 / 汉堡菜单 / 回链分组展开 */
(function () {
  // 汉堡菜单
  var burger = document.querySelector('.hamburger');
  var sidebar = document.getElementById('sidebar');
  if (burger && sidebar) {
    burger.addEventListener('click', function () { sidebar.classList.toggle('open'); });
    document.addEventListener('click', function (e) {
      if (sidebar.classList.contains('open') && !sidebar.contains(e.target) && e.target !== burger) {
        sidebar.classList.remove('open');
      }
    });
  }

  // 分组折叠（记忆状态）
  var KEY = 'zs-nav-open';
  var saved = {};
  try { saved = JSON.parse(localStorage.getItem(KEY) || '{}'); } catch (e) {}
  document.querySelectorAll('.nav-group-title').forEach(function (t) {
    var gi = t.getAttribute('data-group');
    var items = t.nextElementSibling;
    if (gi in saved) { t.classList.toggle('open', !!saved[gi]); items.classList.toggle('open', !!saved[gi]); }
    t.addEventListener('click', function () {
      t.classList.toggle('open');
      items.classList.toggle('open');
      saved[gi] = items.classList.contains('open');
      try { localStorage.setItem(KEY, JSON.stringify(saved)); } catch (e) {}
    });
  });

  // 回链分组展开
  document.querySelectorAll('.bl-group-header').forEach(function (h) {
    h.addEventListener('click', function (e) {
      if (e.target.closest('a')) return; // 点链接正常跳转
      var g = h.parentElement;
      if (g.hasAttribute('data-open')) g.removeAttribute('data-open');
      else g.setAttribute('data-open', '');
    });
  });
})();
