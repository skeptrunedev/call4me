/* Search stays in this document. The original page remains the no script fallback. */
(function () {
  function normalize(value) { return value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase(); }
  document.querySelectorAll('[data-collection-search]').forEach(function (form) {
    var kind = form.dataset.collectionSearch;
    var input = form.querySelector('input[type="search"]');
    var clear = form.querySelector('[data-search-clear]');
    var startedWithQuery = Boolean(input.value.trim());
    var status = document.getElementById(kind + '-search-status');
    var results = document.getElementById(kind + '-search-results');
    var original = Array.from(document.querySelectorAll('[data-search-original]'));
    var items = kind === 'blog'
      ? JSON.parse(document.getElementById('blog-search-catalog').textContent)
      : Array.from(document.querySelectorAll('.example')).map(function (element) {
        return { element: element, title: element.querySelector('h2').textContent, text: element.textContent };
      });
    items.forEach(function (item) { item.searchTitle = normalize(item.title); item.searchText = normalize(item.text); });
    function update() {
      var query = input.value.trim();
      var words = normalize(query).split(/\s+/).filter(Boolean);
      var matches = items.map(function (item) {
        var score = 0;
        var matches = words.every(function (word) {
          if (item.searchTitle.includes(word)) { score += 10; return true; }
          if (item.searchText.includes(word)) { score++; return true; }
          return false;
        });
        return { item: item, score: matches ? score : -1 };
      }).filter(function (match) { return match.score >= 0; });
      clear.hidden = !query;
      status.hidden = false;
      status.textContent = query
        ? matches.length + ' ' + (kind === 'blog' ? (matches.length === 1 ? 'post' : 'posts') : (matches.length === 1 ? 'example' : 'examples')) + ' matching “' + query + '”.' + (matches.length ? '' : ' Try another search.')
        : (kind === 'blog' ? 'Search all ' + items.length + ' posts.' : 'Showing all ' + items.length + ' examples.');
      if (kind === 'examples') {
        items.forEach(function (item) {
          var visible = matches.some(function (match) { return match.item === item; });
          item.element.hidden = !visible;
          if (!visible) item.element.querySelectorAll('audio').forEach(function (audio) { audio.pause(); });
        });
        return;
      }
      var showDefaultCatalog = !query && startedWithQuery;
      original.forEach(function (element) { element.hidden = Boolean(query) || showDefaultCatalog; });
      results.hidden = !query && !showDefaultCatalog;
      results.replaceChildren();
      if (!query && !showDefaultCatalog) return;
      if (showDefaultCatalog) {
        matches = matches.slice(0, 12);
        status.textContent = 'Showing ' + matches.length + ' of ' + items.length + ' posts.';
      }
      matches.sort(function (a, b) { return b.score - a.score; });
      matches.forEach(function (match) {
        var item = match.item;
        var card = document.createElement('article');
        card.className = 'card';
        var content = document.createElement('div');
        content.className = 'card-text';
        var link = document.createElement('a');
        link.className = 'card-title'; link.href = '/blog/' + item.slug; link.textContent = item.title;
        var subtitle = document.createElement('div'); subtitle.className = 'dek'; subtitle.textContent = item.subtitle;
        var date = document.createElement('div'); date.className = 'small muted'; date.textContent = item.date;
        content.append(link, subtitle, date); card.append(content); results.append(card);
      });
      if (showDefaultCatalog && items.length > 12) {
        var next = document.createElement('a');
        next.href = '/blog?page=2'; next.textContent = 'next page'; results.append(next);
      }
    }
    form.hidden = false;
    clear.addEventListener('click', function () { input.value = ''; update(); input.focus(); });
    form.addEventListener('submit', function (event) { event.preventDefault(); update(); });
    input.addEventListener('input', update);
    if (kind === 'examples') window.addEventListener('hashchange', function () {
      var target = items.find(function (item) { return '#' + item.element.id === location.hash; });
      if (target && target.element.hidden) { input.value = ''; update(); target.element.scrollIntoView(); }
    });
    update();
  });
})();
