/**
 * Saka-irs client — shared helpers & state (plain vanilla JS).
 */
(function () {
    'use strict';

    const Saka = (window.Saka = window.Saka || {});

    /* ── DOM helpers ─────────────────────────────────────── */

    Saka.$ = function (sel, root) {
        return (root || document).querySelector(sel);
    };

    Saka.show = function (el) { el.classList.remove('hidden'); };
    Saka.hide = function (el) { el.classList.add('hidden'); };

    Saka.setText = function (el, text) { el.textContent = text; };

    /* ── Status line ─────────────────────────────────────── */

    const statusEl = document.getElementById('form-status');

    Saka.setStatus = function (message, kind) {
        if (!statusEl) return;
        statusEl.className = 'status ' + (kind || 'info');
        statusEl.textContent = message;
        Saka.show(statusEl);
    };

    Saka.clearStatus = function () {
        if (!statusEl) return;
        statusEl.textContent = '';
        statusEl.className = 'status hidden';
    };

    /* ── API wrapper ─────────────────────────────────────── */

    /**
     * POST multipart form data to an API endpoint.
     * Resolves with parsed JSON or rejects with an Error carrying server message.
     */
    Saka.postForm = function (endpoint, formData) {
        return fetch(endpoint, { method: 'POST', body: formData })
            .then(function (res) {
                return res.json().catch(function () {
                    throw new Error('Server returned a non-JSON response (' + res.status + ').');
                }).then(function (json) {
                    if (!res.ok) {
                        const msg = json && json.error && json.error.message
                            ? json.error.message
                            : 'Request failed with status ' + res.status;
                        const err = new Error(msg);
                        err.payload = json;
                        throw err;
                    }
                    return json;
                });
            });
    };

    /* ── GET helper ──────────────────────────────────────── */

    /**
     * GET JSON from an API endpoint.
     * Resolves with parsed JSON or rejects with an Error carrying server message.
     */
    Saka.getJSON = function (url) {
        return fetch(url)
            .then(function (res) {
                return res.json().catch(function () {
                    throw new Error('Server returned a non-JSON response (' + res.status + ').');
                }).then(function (json) {
                    if (!res.ok) {
                        const msg = json && json.error && json.error.message
                            ? json.error.message
                            : 'Request failed with status ' + res.status;
                        const err = new Error(msg);
                        err.payload = json;
                        throw err;
                    }
                    return json;
                });
            });
    };

    /* ── Formatting helpers ──────────────────────────────── */

    Saka.fmtBytes = function (n) {
        if (!Number.isFinite(n)) return '—';
        if (n < 1024) return n + ' B';
        if (n < 1048576) return (n / 1024).toFixed(1) + ' KB';
        if (n < 1073741824) return (n / 1048576).toFixed(2) + ' MB';
        return (n / 1073741824).toFixed(2) + ' GB';
    };


    Saka.state = {
        file: null,
        previewUrl: null,
        busy: false
    };
})();
