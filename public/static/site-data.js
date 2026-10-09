(function () {
  'use strict';
  if (!document.body.hasAttribute('data-site-static')) return;

  var post = document.querySelector('[data-site-post]');
  var slug = post ? post.getAttribute('data-site-post') : null;
  var blog = location.pathname === '/blog' || location.pathname.indexOf('/blog/') === 0;
  var endpoint = blog ? '/blog/site-data' : '/api/site-data';
  if (slug) endpoint += '?post=' + encodeURIComponent(slug);
  var status = document.createElement('p');
  status.className = 'small site-data-status';
  status.setAttribute('role', 'status');
  status.hidden = true;
  (document.querySelector('footer') || document.body).appendChild(status);

  function each(selector, update) {
    document.querySelectorAll(selector).forEach(function (element) {
      update(element);
      element.removeAttribute('aria-busy');
    });
  }

  function apply(data) {
    each('[data-site-account]', function (element) {
      element.textContent = data.signedIn ? 'my account' : 'sign up / sign in';
      element.setAttribute('href', data.signedIn ? '/account' : '/login');
    });
    each('[data-site-call-count]', function (element) {
      element.textContent = ' / ' + data.callCount.toLocaleString('en-US') + (data.callCount === 1 ? ' call placed' : ' calls placed');
    });
    each('[data-site-countries]', function (element) {
      element.textContent = data.availableCountries > 0 ? ' (numbers available in ' + data.availableCountries + ' countries)' : '';
    });
    if (!blog) return;
    each('[data-site-subscribers]', function (element) {
      element.textContent = data.subscribers > 0 ? ' / ' + data.subscribers + (data.subscribers === 1 ? ' reader subscribed' : ' readers subscribed') : '';
    });
    each('[data-site-engagement]', function (element) {
      var counts = data.engagement[element.getAttribute('data-site-engagement')];
      if (!counts) throw new Error('Missing post counts');
      element.textContent = (counts.likes > 0 ? '♥ ' + counts.likes : '') + (counts.comments > 0 ? ' 💬 ' + counts.comments : '');
    });
    if (!slug) return;
    if (!data.post || data.post.slug !== slug) throw new Error('Missing post information');
    var counts = data.engagement[slug];
    each('[data-site-like]', function (element) {
      element.textContent = '[ ' + (data.post.liked ? '♥' : '♡') + ' ' + counts.likes + ' ]';
      element.classList.toggle('on', data.post.liked);
      element.setAttribute('aria-pressed', String(data.post.liked));
    });
    each('[data-site-comment-link]', function (element) { element.textContent = '[ 💬 ' + counts.comments + ' ]'; });
    each('[data-site-comment-heading]', function (element) { element.textContent = counts.comments + (counts.comments === 1 ? ' comment' : ' comments'); });
    each('[data-site-comments]', function (element) {
      // Same-origin fragment comes from BlogComments, which escapes every user field.
      element.innerHTML = data.post.commentsHtml;
    });
    each('[data-site-supporter]', function (element) { element.hidden = !data.post.supporter; });
    if (/^#c-[a-zA-Z0-9_-]+$/.test(location.hash)) {
      var target = document.getElementById(location.hash.slice(1));
      if (target) target.scrollIntoView();
    }
  }

  function failed() {
    each('[data-site-call-count]', function (element) { element.textContent = ' / call count unavailable'; });
    each('[data-site-countries]', function (element) { element.textContent = ' (country availability could not be loaded)'; });
    each('[data-site-engagement]', function (element) { element.textContent = 'counts unavailable'; });
    each('[data-site-subscribers]', function (element) { element.textContent = ' / reader count unavailable'; });
    each('[data-site-like]', function (element) { element.textContent = 'like (count unavailable)'; });
    each('[data-site-comments]', function (element) {
      element.textContent = 'Comments could not be loaded. ';
      var link = document.createElement('a');
      link.href = location.pathname + '?live=1#comments';
      link.textContent = 'view current comments';
      element.appendChild(link);
    });
    status.replaceChildren(document.createTextNode('Live information could not be loaded. '));
    var retry = document.createElement('button');
    retry.type = 'button';
    retry.textContent = 'retry';
    retry.addEventListener('click', load);
    status.appendChild(retry);
    status.hidden = false;
  }

  async function load() {
    status.hidden = true;
    var controller = new AbortController();
    var timeout = setTimeout(function () { controller.abort(); }, 15000);
    try {
      var response = await fetch(endpoint, { credentials: 'same-origin', cache: 'no-store', headers: { accept: 'application/json' }, signal: controller.signal });
      if (!response.ok) throw new Error('Live information unavailable');
      var data = await response.json();
      if (typeof data.signedIn !== 'boolean' || !Number.isSafeInteger(data.callCount) || data.callCount < 0) throw new Error('Invalid live information');
      apply(data);
    } catch (error) {
      console.error('site data failed', error);
      failed();
    } finally {
      clearTimeout(timeout);
    }
  }

  // The article paints before any database dependent request starts.
  requestAnimationFrame(function () { requestAnimationFrame(load); });
})();
