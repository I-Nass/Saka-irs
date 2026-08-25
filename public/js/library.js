/**
 * Saka-irs client — Library view (F2).
 * Grid of indexed images: stats bar, pagination, delete, metadata dialog.
 */
(function () {
    'use strict';

    if (!window.Saka) return;
    const Saka = window.Saka;

    const grid = document.getElementById('library-grid');
    if (!grid) return; // not on the library page

    const statsBar = document.getElementById('library-stats');
    const emptyEl = document.getElementById('library-empty');
    const errorEl = document.getElementById('library-error');
    const moreBtn = document.getElementById('library-more');
    const template = document.getElementById('lib-card-template');

    const PAGE_SIZE = 24;
    let offset = 0;
    let total = null;
    let bytesTotal = null;

    function fmtBytes(n) {
        if (!Number.isFinite(n)) return '—';
        if (n < 1024) return n + ' B';
        if (n < 1048576) return (n / 1024).toFixed(1) + ' KB';
        if (n < 1073741824) return (n / 1048576).toFixed(2) + ' MB';
        return (n / 1073741824).toFixed(2) + ' GB';
    }

    function renderStats() {
        if (!statsBar) return;
        statsBar.innerHTML = '';
        const chips = [
            total !== null ? total + (total === 1 ? ' image' : ' images') : '…',
            fmtBytes(bytesTotal)
        ];
        chips.forEach(function (text) {
            const span = document.createElement('span');
            span.className = 'stat-chip';
            span.textContent = text;
            statsBar.appendChild(span);
        });
    }

    function buildCard(img) {
        const card = template.content.firstElementChild.cloneNode(true);
        const thumbBtn = card.querySelector('.lib-thumb-btn');
        thumbBtn.setAttribute('data-meta-id', img.id);
        thumbBtn.setAttribute('aria-label', 'Details for ' + (img.originalName || 'image'));

        const thumbImg = card.querySelector('.lib-thumb');
        thumbImg.src = img.thumbnailUrl;
        thumbImg.alt = img.originalName || 'Indexed image';

        card.querySelector('.lib-name').textContent = img.originalName || '(unnamed)';
        card.querySelector('.lib-meta').textContent =
            (img.width && img.height ? img.width + '×' + img.height : '') +
            ' · ' + Saka.fmtBytes(img.size) +
            ' · ' + new Date(img.createdAt).toLocaleDateString();

        card.querySelectorAll('[data-role="details"]').forEach(function (b) {
            b.setAttribute('data-meta-id', img.id);
        });

        card.querySelector('[data-role="delete"]').addEventListener('click', function () {
            if (!window.confirm('Delete "' + (img.originalName || 'this image') + '" from the library?')) return;
            fetch('/api/images/' + encodeURIComponent(img.id), { method: 'DELETE' })
                .then(function (res) {
                    if (!res.ok) throw new Error('Delete failed (' + res.status + ').');
                    card.remove();
                    if (total !== null) total = Math.max(total - 1, 0);
                    if (bytesTotal !== null) bytesTotal = Math.max(bytesTotal - img.size, 0);
                    renderStats();
                    if (grid.children.length === 0) emptyEl.classList.remove('hidden');
                })
                .catch(function (err) {
                    errorEl.textContent = err.message;
                    errorEl.classList.remove('hidden');
                });
        });

        return card;
    }

    function loadPage() {
        errorEl.classList.add('hidden');
        Saka.getJSON('/api/images?limit=' + PAGE_SIZE + '&offset=' + offset)
            .then(function (json) {
                total = json.total;
                bytesTotal = json.stats.bytes;
                renderStats();

                json.images.forEach(function (img) { grid.appendChild(buildCard(img)); });
                offset += json.count;

                Saka.hide(emptyEl);
                if (total === 0) Saka.show(emptyEl);

                if (offset < total) Saka.show(moreBtn);
                else Saka.hide(moreBtn);
            })
            .catch(function (err) {
                errorEl.textContent = err.message;
                errorEl.classList.remove('hidden');
                if (offset === 0) Saka.show(emptyEl);
            });
    }

    moreBtn.addEventListener('click', loadPage);
    loadPage();
})();
