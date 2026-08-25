/**
 * Saka-irs client — History view (F2).
 * Timeline of recent searches with status + provider pills and query thumbs.
 */
(function () {
    'use strict';

    if (!window.Saka) return;
    const Saka = window.Saka;

    const list = document.getElementById('history-list');
    if (!list) return; // not on the history page

    const emptyEl = document.getElementById('history-empty');
    const errorEl = document.getElementById('history-error');
    const template = document.getElementById('history-item-template');

    function providerPill(name, info) {
        const pill = document.createElement('span');
        pill.className = 'pill ' + info.status;
        let text = name.replace(/-/g, ' ') + ': ' + info.status;
        if (info.status === 'ok' && typeof info.resultCount === 'number') text += ' (' + info.resultCount + ')';
        if (info.error) pill.title = info.error;
        else if (info.reason) { pill.title = info.reason; }
        pill.textContent = text;
        return pill;
    }

    function buildItem(search) {
        const item = template.content.firstElementChild.cloneNode(true);

        const thumb = item.querySelector('.tl-thumb');
        if (search.queryImageId) {
            thumb.src = '/api/images/' + search.queryImageId + '/thumbnail';
            thumb.setAttribute('data-meta-id', String(search.queryImageId));
            thumb.style.cursor = 'zoom-in';
        } else {
            item.querySelector('.tl-thumb-wrap').classList.add('is-empty');
            thumb.remove();
        }

        const date = new Date(search.createdAt);
        item.querySelector('.tl-date').textContent = isNaN(date.getTime()) ? '' : date.toLocaleString();

        const statusPill = item.querySelector('.tl-status');
        statusPill.textContent = search.status;
        statusPill.classList.add(search.status === 'completed' ? 'ok' : search.status);

        const parts = [];
        parts.push((search.resultCount || 0) + (search.resultCount === 1 ? ' result' : ' results'));
        if (search.durationMs) parts.push(search.durationMs + 'ms');
        const hintBits = Object.values(search.hints || {}).filter(Boolean);
        if (hintBits.length) parts.push('hints: ' + hintBits.join(', '));
        item.querySelector('.tl-meta').textContent = parts.join(' · ');

        const provWrap = item.querySelector('.tl-providers');
        (search.providersUsed || []).forEach(function (p) {
            provWrap.appendChild(providerPill(p.name, p));
        });
        if (!(search.providersUsed || []).length) provWrap.classList.add('hidden');

        return item;
    }

    Saka.getJSON('/api/searches')
        .then(function (json) {
            if (!json.searches.length) {
                Saka.show(emptyEl);
                return;
            }
            json.searches.forEach(function (s) { list.appendChild(buildItem(s)); });
        })
        .catch(function (err) {
            errorEl.textContent = err.message;
            errorEl.classList.remove('hidden');
            Saka.show(emptyEl);
        });
})();
