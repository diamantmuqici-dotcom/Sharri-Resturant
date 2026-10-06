(function () {
  'use strict';
  var state = { categories: [], products: [], category: 'all', query: '' };
  var sections = document.getElementById('public-menu-sections');
  var status = document.getElementById('menu-status');
  var filters = document.getElementById('menu-categories');
  var search = document.getElementById('menu-search');
  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function price(cents) { return (Number(cents) / 100).toFixed(2) + '€'; }
  function packshot(product) {
    return product.kind === 'PIJE' || product.kind === 'KAFE' || /multisola|ice tea|jager|j[aä]ger|mokne|laqin|lacin|peje|peja|laqko|bavaria|heniken|heineken|schweeps|schweppes|redbull|red bull/i.test(product.name);
  }
  function renderFilters() {
    var buttons = [{ id: 'all', name: 'Të gjitha' }].concat(state.categories);
    filters.innerHTML = buttons.map(function (category) {
      return '<button type="button" class="btn public-category-btn ' + (String(state.category) === String(category.id) ? 'primary' : '') + '" data-category="' + esc(category.id) + '">' + esc(category.name) + '</button>';
    }).join('');
  }
  function filteredProducts() {
    var q = state.query.trim().toLocaleLowerCase('sq');
    return state.products.filter(function (product) {
      var categoryMatch = state.category === 'all' || String(product.category_id) === String(state.category);
      var textMatch = !q || (product.name + ' ' + product.category_name).toLocaleLowerCase('sq').includes(q);
      return categoryMatch && textMatch;
    });
  }
  function render() {
    var products = filteredProducts();
    if (!products.length) {
      sections.innerHTML = '';
      status.textContent = 'Nuk u gjet asnjë produkt. Provo një kërkim tjetër.';
      return;
    }
    status.textContent = '';
    var visibleCategories = state.category === 'all'
      ? state.categories
      : state.categories.filter(function (c) { return String(c.id) === String(state.category); });
    sections.innerHTML = visibleCategories.map(function (category) {
      var list = products.filter(function (p) { return String(p.category_id) === String(category.id); });
      if (!list.length) return '';
      return '<section class="public-category-section"><h2>' + esc(category.name) + '</h2><div class="public-product-grid">' + list.map(function (product) {
        var photo = product.image_path || '/images/grill-platter.jpg';
        var soldOut = product.available === 0;
        return '<article class="public-product-card' + (soldOut ? ' is-unavailable' : '') + '"><img class="public-product-image' + (packshot(product) ? ' is-packshot' : '') + '" src="' + esc(photo) + '" alt="Foto ilustruese: ' + esc(product.name) + '" loading="lazy" decoding="async" onerror="this.src=\'/images/grill-platter.jpg\'"><div class="public-product-body"><div class="public-product-copy"><h3>' + esc(product.name) + '</h3>' + (soldOut ? '<small class="public-availability-badge">Përkohësisht pa stok</small>' : '') + '</div><span class="public-product-price">' + price(product.price_cents) + '</span></div></article>';
      }).join('') + '</div></section>';
    }).join('');
  }
  filters.addEventListener('click', function (event) {
    var button = event.target.closest('[data-category]');
    if (!button) return;
    state.category = button.getAttribute('data-category');
    renderFilters();
    render();
  });
  search.addEventListener('input', function () { state.query = search.value; render(); });
  fetch('/api/public-menu').then(function (response) {
    if (!response.ok) throw new Error('Menuja nuk u ngarkua.');
    return response.json();
  }).then(function (menu) {
    state.categories = menu.categories || [];
    state.products = menu.products || [];
    renderFilters();
    render();
  }).catch(function () { status.textContent = 'Menuja nuk u ngarkua. Provo ta rifreskosh faqen.'; });
})();
