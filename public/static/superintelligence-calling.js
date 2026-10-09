/* Progressive enhancement: the complete sourced comparison is readable without JavaScript. */
(function () {
  var form = document.querySelector('[data-si-filters]');
  if (!form) return;
  var search = document.getElementById('si-search');
  var evidence = document.getElementById('si-evidence');
  var rows = Array.from(document.querySelectorAll('[data-si-row]'));
  var count = document.getElementById('si-count');
  var empty = document.getElementById('si-empty');
  function update() {
    var query = search.value.trim().toLocaleLowerCase();
    var visible = 0;
    rows.forEach(function (row) {
      var matches = (evidence.value === 'all' || row.dataset.evidence === evidence.value) && row.textContent.toLocaleLowerCase().includes(query);
      row.hidden = !matches;
      if (matches) visible++;
    });
    count.textContent = 'Showing ' + visible + ' of ' + rows.length + ' calling configurations.';
    empty.hidden = visible !== 0;
  }
  form.hidden = false;
  form.addEventListener('submit', function (event) { event.preventDefault(); update(); });
  search.addEventListener('input', update);
  evidence.addEventListener('change', update);
  form.addEventListener('reset', function () { search.value = ''; evidence.value = 'all'; update(); });
  function revealAnchor() {
    var row = rows.find(function (item) { return '#' + item.id === location.hash; });
    if (!row) return;
    form.reset();
    row.querySelector('details').open = true;
    row.scrollIntoView({ block: 'center' });
  }
  window.addEventListener('hashchange', revealAnchor);
  revealAnchor();
  document.querySelectorAll('.si-recording audio').forEach(function (audio) {
    audio.addEventListener('play', function () {
      document.querySelectorAll('.si-recording audio').forEach(function (other) { if (other !== audio) other.pause(); });
    });
  });
})();
