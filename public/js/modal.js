/**
 * Saka-irs client — metadata inspector dialog (F2).
 * Native <dialog>; opens from any element carrying data-meta-id="<imageId>".
 */
(function () {
    'use strict';

    if (!window.Saka) return;
    const Saka = window.Saka;

    let dialog = null;

    function fmtBytes(n) {
        if (!Number.isFinite(n)) return '—';
        if (n < 1024) return n + ' B';
        if (n < 1048576) return (n / 1024).toFixed(1) + ' KB';
        return (n / 1048576).toFixed(2) + ' MB';
    }

    function esc(v) { return v === null || v === undefined || v === '' ? '—' : String(v); }

    function addRow(grid, label, value, opts) {
        const dt = document.createElement('div');
        dt.className = 'meta-label';
        dt.textContent = label;
        const dd = document.createElement('div');
        dd.className = 'meta-value' + (opts && opts.code ? ' code' : '');
        dd.textContent = value;
        if (opts && opts.title) dd.title = opts.title;
        grid.appendChild(dt);
        grid.appendChild(dd);
    }

    function ensureDialog() {
        if (dialog) return dialog;

        dialog = document.createElement('dialog');
        dialog.className = 'meta-dialog';
        dialog.innerHTML =
            '<div class="meta-head">' +
            '  <h3>Image details</h3>' +
            '  <button type="button" class="btn-icon meta-close" aria-label="Close">' +
            '    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6 L18 18 M18 6 L6 18" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>' +
            '  </button>' +
            '</div>' +
            '<img class="meta-preview" alt="Image preview">' +
            '<div class="meta-grid"></div>';

        document.body.appendChild(dialog);

        dialog.querySelector('.meta-close').addEventListener('click', function () { dialog.close(); });
        // click on backdrop closes
        dialog.addEventListener('click', function (e) {
            if (e.target === dialog) dialog.close();
        });

        return dialog;
    }

    function fill(image) {
        const dlg = ensureDialog();

        const preview = dlg.querySelector('.meta-preview');
        preview.src = image.thumbnailUrl || '';
        preview.alt = image.originalName || 'preview';

        const grid = dlg.querySelector('.meta-grid');
        grid.innerHTML = '';

        addRow(grid, 'Filename', esc(image.originalName));
        addRow(grid, 'Dimensions', image.width && image.height ? image.width + ' × ' + image.height + ' px' : '—');
        addRow(grid, 'File size', fmtBytes(image.size));
        addRow(grid, 'Type', esc(image.mimeType));
        addRow(grid, 'Added', image.createdAt ? new Date(image.createdAt).toLocaleString() : '—');
        addRow(grid, 'Expires', image.expiresAt ? new Date(image.expiresAt).toLocaleString() : '—');

        addRow(grid, 'EXIF present', image.metadata && image.metadata.hasExif ? 'Yes' : 'No');
        addRow(grid, 'Camera', esc(image.metadata && image.metadata.cameraModel));
        addRow(grid, 'Taken', image.metadata && image.metadata.takenAt
            ? new Date(image.metadata.takenAt).toLocaleString() : '—');

        const gpsBadge = document.createElement('span');
        gpsBadge.className = 'badge confidence ' + (image.metadata && image.metadata.hasGps ? 'moderate' : 'strong');
        gpsBadge.textContent = image.metadata && image.metadata.hasGps ? 'GPS flag: yes' : 'GPS flag: no';
        gpsBadge.title = 'Only the presence of GPS is recorded — coordinates are never stored.';
        const gpsLabel = document.createElement('div');
        gpsLabel.className = 'meta-label';
        gpsLabel.textContent = 'Location data';
        const gpsValue = document.createElement('div');
        gpsValue.className = 'meta-value';
        gpsValue.appendChild(gpsBadge);
        grid.appendChild(gpsLabel);
        grid.appendChild(gpsValue);

        const h = image.hashes || {};
        [['pHash', h.phash], ['dHash', h.dhash], ['aHash', h.ahash]].forEach(function (pair) {
            const full = pair[1] || '';
            addRow(grid, pair[0], full ? full.slice(0, 10) + '…' : '—', { code: true, title: full });
        });
    }

    Saka.openMetaDialog = function (imageId) {
        fetch('/api/images/' + encodeURIComponent(imageId))
            .then(function (res) {
                return res.json().then(function (json) {
                    if (!res.ok) throw new Error(json && json.error ? json.error.message : 'Failed to load details.');
                    return json.image;
                });
            })
            .then(function (image) {
                fill(image);
                ensureDialog().showModal();
            })
            .catch(function (err) {
                if (Saka.setStatus) Saka.setStatus(err.message, 'error');
            });
    };

    // Global delegation — works for cards rendered at any time.
    document.addEventListener('click', function (e) {
        const trigger = e.target.closest('[data-meta-id]');
        if (trigger) Saka.openMetaDialog(trigger.getAttribute('data-meta-id'));
    });
})();
