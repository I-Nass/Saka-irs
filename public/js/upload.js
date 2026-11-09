/**
 * Saka-irs client — upload handling: preview, drag & drop, submit.
 * Plain vanilla JS. Two actions: Search and Add to Library.
 */
(function () {
    'use strict';

    if (!window.Saka) return;
    const Saka = window.Saka;

    const form = document.getElementById('saka-form');
    if (!form) return;

    const dropzone = document.getElementById('dropzone');
    const input = document.getElementById('image-input');
    const preview = document.getElementById('preview');
    const dzHint = document.getElementById('dropzone-hint');
    const buttons = form.querySelectorAll('button[type="submit"]');
    const btnInspect = document.getElementById('btn-inspect-forensics');
    const btnPivot = document.getElementById('btn-pivot');

    function setButtonsEnabled(enabled) {
        buttons.forEach(function (b) { b.disabled = !enabled; });
        if (btnInspect) btnInspect.disabled = !enabled;
        if (btnPivot) btnPivot.disabled = !enabled;
    }

    function setPreview(file) {
        if (Saka.state.previewUrl) {
            URL.revokeObjectURL(Saka.state.previewUrl);
            Saka.state.previewUrl = null;
        }
        if (!file) {
            Saka.hide(preview);
            Saka.show(dzHint);
            setButtonsEnabled(false);
            return;
        }
        Saka.state.previewUrl = URL.createObjectURL(file);
        preview.src = Saka.state.previewUrl;
        Saka.show(preview);
        Saka.hide(dzHint);
        setButtonsEnabled(true);
        Saka.clearStatus();
    }

    function acceptFile(file) {
        if (!file) return;
        if (file.type && file.type.indexOf('image/') !== 0) {
            Saka.setStatus('That does not look like an image file.', 'error');
            return;
        }
        Saka.state.file = file;
        setPreview(file);

        // Smart UX: auto-populate keyword hint if empty and filename has meaningful words
        if (file.name && form.elements.keyword && !form.elements.keyword.value.trim()) {
            const cleaned = file.name
                .replace(/\.[a-z0-9]+$/i, '')
                .replace(/[-_+]/g, ' ')
                .replace(/[^a-zA-Z0-9\s]/g, '')
                .replace(/\s+/g, ' ')
                .trim();
            const isGeneric = /^(img|dsc|photo|image|screenshot|pxl|sample)[\s\d_-]*$/i.test(cleaned);
            if (!isGeneric && cleaned.length >= 3) {
                form.elements.keyword.value = cleaned;
            }
        }
    }

    /* ── Clipboard Paste (Ctrl+V) ────────────────────────── */
    window.addEventListener('paste', function (e) {
        if (!e.clipboardData || !e.clipboardData.items) return;
        for (let i = 0; i < e.clipboardData.items.length; i++) {
            const item = e.clipboardData.items[i];
            if (item.type && item.type.indexOf('image/') === 0) {
                const file = item.getAsFile();
                if (file) {
                    acceptFile(file);
                    Saka.setStatus('Image pasted from clipboard ✓', 'info');
                    break;
                }
            }
        }
    });

    /* ── Events ──────────────────────────────────────────── */

    dropzone.addEventListener('click', function () { input.click(); });
    dropzone.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); }
    });

    input.addEventListener('change', function () {
        acceptFile(input.files && input.files[0]);
    });

    ['dragenter', 'dragover'].forEach(function (evt) {
        dropzone.addEventListener(evt, function (e) {
            e.preventDefault();
            dropzone.classList.add('dragover');
        });
    });
    ['dragleave', 'drop'].forEach(function (evt) {
        dropzone.addEventListener(evt, function (e) {
            e.preventDefault();
            dropzone.classList.remove('dragover');
        });
    });
    dropzone.addEventListener('drop', function (e) {
        if (e.dataTransfer && e.dataTransfer.files.length) {
            acceptFile(e.dataTransfer.files[0]);
        }
    });

    /* ── Submit (Search or Index) ────────────────────────── */

    form.addEventListener('submit', function (e) {
        e.preventDefault();
        if (Saka.state.busy || !Saka.state.file) return;

        const actionButton = e.submitter || document.querySelector('#saka-form button:focus') ||
            form.querySelector('button[data-action="search"]');
        const action = actionButton ? actionButton.getAttribute('data-action') : 'search';

        const formData = new FormData();
        formData.append('image', Saka.state.file, Saka.state.file.name);

        ['name', 'location', 'username', 'organization', 'keyword'].forEach(function (key) {
            const field = form.elements[key];
            if (field && field.value.trim()) formData.append(key, field.value.trim());
        });

        Saka.state.busy = true;
        setButtonsEnabled(false);
        Saka.setStatus(action === 'index'
            ? 'Indexing image… normalizing & fingerprinting.'
            : 'Saka — searching your library…', 'info');

        const endpoint = action === 'index' ? '/api/images' : '/api/search';

        Saka.postForm(endpoint, formData)
            .then(function (json) {
                if (action === 'index') {
                    Saka.setStatus('Added to library ✓ — "' + json.image.originalName + '"', 'success');
                } else {
                    Saka.setStatus('Search completed in ' + json.durationMs + 'ms.', 'success');
                    Saka.renderResults(json);
                }
            })
            .catch(function (err) {
                Saka.setStatus(err.message, 'error');
                if (action === 'search' && window.Saka.showResultsError) {
                    Saka.showResultsError();
                }
            })
            .finally(function () {
                Saka.state.busy = false;
                setButtonsEnabled(!!Saka.state.file);
            });
    });
})();
