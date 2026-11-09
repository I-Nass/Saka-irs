/**
 * Saka-irs client — manual reverse-image pivot panel.
 *
 * The general-web engines (Google Lens, Yandex, TinEye) have no usable API and
 * forbid scripted searching. What they do support is a human upload in a tab.
 * So this panel hands the user a metadata-stripped PNG, copies it to the
 * clipboard, and opens the engine — the upload happens in the user's own
 * browser session, never from this server.
 *
 * Works for two sources:
 *   { file }     an image selected in the upload form (not yet indexed)
 *   { imageId }  an already-indexed image, rendered to PNG server-side
 */
(function () {
    'use strict';

    if (!window.Saka) return;
    const Saka = window.Saka;

    const ENGINES_URL = '/api/pivot/engines';
    const MAX_CLIENT_DIM = 1400;

    let dialog = null;
    let gridEl = null;
    let statusEl = null;
    let noteEl = null;
    let enginesCache = null;

    let blob = null;
    let fileName = 'saka-pivot.png';
    let busy = false;

    /* ── DOM helpers ─────────────────────────────────────── */

    function make(tag, className, text) {
        const node = document.createElement(tag);
        if (className) node.className = className;
        if (text !== undefined) node.textContent = text;
        return node;
    }

    function setStatus(message, kind) {
        if (!statusEl) return;
        statusEl.textContent = message || '';
        statusEl.className = 'pivot-status' + (kind ? ' ' + kind : '');
    }

    function setEnginesEnabled(enabled) {
        if (!gridEl) return;
        Array.from(gridEl.querySelectorAll('button')).forEach(function (button) {
            button.disabled = !enabled;
        });
    }

    /* ── Dialog construction ─────────────────────────────── */

    function ensureDialog() {
        if (dialog) return dialog;

        dialog = make('dialog', 'pivot-dialog');

        const head = make('div', 'pivot-head');
        head.appendChild(make('h3', null, 'Reverse image search'));
        const close = make('button', 'btn-icon pivot-close');
        close.type = 'button';
        close.setAttribute('aria-label', 'Close');
        close.innerHTML =
            '<svg viewBox="0 0 24 24" aria-hidden="true">' +
            '<path d="M6 6 L18 18 M18 6 L6 18" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>';
        close.addEventListener('click', function () { dialog.close(); });
        head.appendChild(close);

        statusEl = make('p', 'pivot-status', 'Preparing a metadata-stripped copy…');

        gridEl = make('div', 'pivot-grid');

        noteEl = make('p', 'pivot-note');

        const actions = make('div', 'pivot-actions');
        const downloadBtn = make('button', 'btn btn-secondary', 'Download PNG instead');
        downloadBtn.type = 'button';
        downloadBtn.addEventListener('click', function () {
            if (blob) downloadBlob(blob);
        });
        actions.appendChild(downloadBtn);

        dialog.appendChild(head);
        dialog.appendChild(statusEl);
        dialog.appendChild(gridEl);
        dialog.appendChild(actions);
        dialog.appendChild(noteEl);

        dialog.addEventListener('click', function (event) {
            if (event.target === dialog) dialog.close();
        });

        document.body.appendChild(dialog);
        return dialog;
    }

    function renderEngines(engines) {
        gridEl.innerHTML = '';
        engines.forEach(function (engine) {
            const button = make('button', 'pivot-engine' + (engine.best ? ' is-best' : ''));
            button.type = 'button';
            button.setAttribute('data-engine', engine.id);

            button.appendChild(make('span', 'pivot-engine-label', engine.label));
            if (engine.coverage) button.appendChild(make('span', 'pivot-engine-meta', engine.coverage));
            if (engine.accepts) button.appendChild(make('span', 'pivot-engine-hint', engine.accepts));

            button.addEventListener('click', function () { launch(engine); });
            gridEl.appendChild(button);
        });
    }

    /* ── Image acquisition ───────────────────────────────── */

    async function loadEngines() {
        if (enginesCache) return enginesCache;
        const response = await fetch(ENGINES_URL, { headers: { Accept: 'application/json' } });
        if (!response.ok) throw new Error('Could not load the engine list (HTTP ' + response.status + ').');
        enginesCache = await response.json();
        return enginesCache;
    }

    function fileToPngBlob(file) {
        return new Promise(function (resolve, reject) {
            const objectUrl = URL.createObjectURL(file);
            const image = new Image();

            image.onload = function () {
                try {
                    const width = image.naturalWidth || 1;
                    const height = image.naturalHeight || 1;
                    const scale = Math.min(1, MAX_CLIENT_DIM / Math.max(width, height));

                    const canvas = document.createElement('canvas');
                    canvas.width = Math.max(1, Math.round(width * scale));
                    canvas.height = Math.max(1, Math.round(height * scale));

                    const context = canvas.getContext('2d');
                    context.drawImage(image, 0, 0, canvas.width, canvas.height);

                    canvas.toBlob(function (result) {
                        URL.revokeObjectURL(objectUrl);
                        if (result) resolve(result);
                        else reject(new Error('PNG conversion failed.'));
                    }, 'image/png');
                } catch (err) {
                    URL.revokeObjectURL(objectUrl);
                    reject(err);
                }
            };

            image.onerror = function () {
                URL.revokeObjectURL(objectUrl);
                reject(new Error('That file could not be decoded as an image.'));
            };

            image.src = objectUrl;
        });
    }

    async function fetchPivotBlob(imageId) {
        const response = await fetch('/api/images/' + encodeURIComponent(imageId) + '/pivot.png');
        if (!response.ok) {
            throw new Error('Could not prepare the image (HTTP ' + response.status + ').');
        }
        return response.blob();
    }

    /* ── Clipboard / download / launch ───────────────────── */

    function clipboardAvailable() {
        return typeof ClipboardItem !== 'undefined' &&
            navigator.clipboard &&
            typeof navigator.clipboard.write === 'function';
    }

    async function copyToClipboard(imageBlob) {
        if (!clipboardAvailable()) return false;
        try {
            await navigator.clipboard.write([new ClipboardItem({ 'image/png': imageBlob })]);
            return true;
        } catch {
            // Permission denied, or the browser refuses image clipboard writes
            // (Firefox). The download fallback covers both cases.
            return false;
        }
    }

    function downloadBlob(imageBlob) {
        const url = URL.createObjectURL(imageBlob);
        const link = document.createElement('a');
        link.href = url;
        link.download = fileName;
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(function () { URL.revokeObjectURL(url); }, 5000);
    }

    function launch(engine) {
        if (!blob || busy) return;

        // Open the tab synchronously so the click gesture is still valid; the
        // clipboard write is async and would otherwise be treated as a popup.
        const tab = window.open('about:blank', '_blank');

        copyToClipboard(blob).then(function (copied) {
            if (!copied) downloadBlob(blob);

            if (tab && !tab.closed) {
                try { tab.location.href = engine.url; } catch { /* cross-origin nav is allowed; ignore odd browsers */ }
            } else {
                window.open(engine.url, '_blank', 'noopener');
            }

            setStatus(
                copied
                    ? 'Image copied — press Ctrl+V in the ' + engine.label + ' tab.'
                    : 'PNG downloaded — drag ' + fileName + ' into the ' + engine.label + ' tab.',
                copied ? 'ok' : 'warn'
            );
        });
    }

    /* ── Public entry point ──────────────────────────────── */

    Saka.openPivot = async function (source) {
        const dlg = ensureDialog();
        blob = null;
        busy = true;
        setEnginesEnabled(false);
        setStatus('Preparing a metadata-stripped copy…');

        if (!dlg.open) dlg.showModal();

        try {
            const meta = await loadEngines();
            renderEngines(meta.engines || []);
            setEnginesEnabled(false);

            noteEl.textContent = meta.note || '';

            if (source && source.file) {
                fileName = String(source.file.name || 'saka-pivot').replace(/\.[a-z0-9]+$/i, '') + '-pivot.png';
                blob = await fileToPngBlob(source.file);
            } else if (source && source.imageId) {
                fileName = 'saka-' + String(source.imageId).slice(-8) + '-pivot.png';
                blob = await fetchPivotBlob(source.imageId);
            } else {
                throw new Error('No image selected.');
            }

            setStatus('Ready — choose an engine. Your browser does the upload.', 'ok');
            setEnginesEnabled(true);
        } catch (err) {
            blob = null;
            setStatus(err.message || 'Could not prepare the image.', 'error');
        } finally {
            busy = false;
        }
    };

    /* ── Wiring ──────────────────────────────────────────── */

    const formButton = document.getElementById('btn-pivot');
    if (formButton) {
        formButton.addEventListener('click', function () {
            if (Saka.state && Saka.state.file) Saka.openPivot({ file: Saka.state.file });
        });
    }

    // Library cards (and anything else) opt in with data-pivot-id="<imageId>".
    document.addEventListener('click', function (event) {
        const trigger = event.target.closest('[data-pivot-id]');
        if (!trigger) return;
        event.preventDefault();
        const imageId = trigger.getAttribute('data-pivot-id');
        if (imageId) Saka.openPivot({ imageId: imageId });
    });
})();
