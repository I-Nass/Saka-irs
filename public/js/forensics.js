/**
 * Saka-irs client — Digital Forensics & Tampering Workspace (Layout 3).
 * Interactive A/B split slider, parameters adjustment, and live tampering analysis
 * covering:
 *   - Error Level Analysis (ELA)
 *   - Sensor Noise Inconsistency / Residual Mapping
 *   - Directional Luminance Gradient Analysis
 */
(function () {
    'use strict';

    if (!window.Saka) return;
    const Saka = window.Saka;

    const panel = document.getElementById('forensics-panel');
    if (!panel) return;

    const baseImg = document.getElementById('ela-base-img');
    const heatImg = document.getElementById('ela-heat-img');
    const divider = document.getElementById('comp-divider');
    const compContainer = document.getElementById('ela-comparison');
    const qualitySelect = document.getElementById('ela-quality-select');
    const scaleSelect = document.getElementById('ela-scale-select');
    const btnToggle = document.getElementById('btn-toggle-view');
    const btnRecompute = document.getElementById('btn-recompute-ela');
    const btnInspect = document.getElementById('btn-inspect-forensics');
    const compLabelOverlay = document.getElementById('comp-label-overlay');
    const descEl = document.getElementById('forensics-description');
    const tabButtons = panel.querySelectorAll('.forensics-tab');

    let currentSource = null; // { file } or { imageId }
    let currentTool = 'ela'; // 'ela' | 'noise' | 'luminance'
    let isDragging = false;
    let dividerPos = 50; // percentage
    let isFullHeatmap = false;

    const TOOL_CONFIG = {
        ela: {
            label: 'ELA Heat Map',
            description: 'Recreates the FotoForensics methodology 100% offline. Highlights JPEG compression variance to expose image splicing, cloned regions, and digital tampering.',
            hasQuality: true,
            hasScale: true
        },
        noise: {
            label: 'Sensor Noise Map',
            description: 'Isolates high-frequency sensor noise grain (PRNU). Spliced objects, healing-brush retouches, or smoothed patches show up as distinct dark dead zones or mismatched grain.',
            hasQuality: false,
            hasScale: true
        },
        luminance: {
            label: 'Luminance Gradient',
            description: 'Computes 2D Sobel directional lighting vectors. Inconsistent shadow directions or light source angles on composited subjects stand out in contrasting hues.',
            hasQuality: false,
            hasScale: false
        }
    };

    /* ── Split Slider Engine ─────────────────────────────── */

    function updateDivider(percent) {
        dividerPos = Math.max(0, Math.min(100, percent));
        divider.style.left = dividerPos + '%';
        heatImg.style.clipPath = 'polygon(' + dividerPos + '% 0%, 100% 0%, 100% 100%, ' + dividerPos + '% 100%)';
    }

    function onPointerMove(e) {
        if (!isDragging) return;
        const rect = compContainer.getBoundingClientRect();
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const x = clientX - rect.left;
        const percent = (x / rect.width) * 100;
        updateDivider(percent);
    }

    function stopDrag() {
        isDragging = false;
        document.removeEventListener('mousemove', onPointerMove);
        document.removeEventListener('mouseup', stopDrag);
        document.removeEventListener('touchmove', onPointerMove);
        document.removeEventListener('touchend', stopDrag);
    }

    compContainer.addEventListener('mousedown', function (e) {
        isDragging = true;
        document.addEventListener('mousemove', onPointerMove);
        document.addEventListener('mouseup', stopDrag);
        onPointerMove(e);
    });

    compContainer.addEventListener('touchstart', function (e) {
        isDragging = true;
        document.addEventListener('touchmove', onPointerMove);
        document.addEventListener('touchend', stopDrag);
        onPointerMove(e);
    }, { passive: true });

    /* ── Tool Tabs ───────────────────────────────────────── */

    tabButtons.forEach(function (btn) {
        btn.addEventListener('click', function () {
            const tool = btn.getAttribute('data-tool');
            if (!tool || tool === currentTool) return;
            currentTool = tool;

            tabButtons.forEach(function (b) { b.classList.remove('is-active'); });
            btn.classList.add('is-active');

            const cfg = TOOL_CONFIG[tool] || TOOL_CONFIG.ela;
            if (compLabelOverlay) compLabelOverlay.textContent = cfg.label;
            if (descEl) descEl.textContent = cfg.description;
            if (qualitySelect) qualitySelect.parentElement.style.display = cfg.hasQuality ? '' : 'none';
            if (scaleSelect) scaleSelect.parentElement.style.display = cfg.hasScale ? '' : 'none';

            if (currentSource) computeForensic(currentSource);
        });
    });

    /* ── View Controls ───────────────────────────────────── */

    btnToggle.addEventListener('click', function () {
        isFullHeatmap = !isFullHeatmap;
        if (isFullHeatmap) {
            divider.classList.add('hidden');
            heatImg.style.clipPath = 'none';
            btnToggle.textContent = 'Split View';
        } else {
            divider.classList.remove('hidden');
            updateDivider(50);
            btnToggle.textContent = 'Show Full Overlay';
        }
    });

    btnRecompute.addEventListener('click', function () {
        if (currentSource) computeForensic(currentSource);
    });

    /* ── Computation & Fetching ──────────────────────────── */

    function computeForensic(source) {
        currentSource = source;
        const quality = qualitySelect ? qualitySelect.value : '90';
        const scale = scaleSelect ? scaleSelect.value : '20';

        Saka.show(panel);
        btnRecompute.disabled = true;
        btnRecompute.textContent = 'Analyzing…';

        let fetchPromise;

        if (source.imageId) {
            baseImg.src = '/api/images/' + encodeURIComponent(source.imageId) + '/thumbnail';
            const url = '/api/images/' + encodeURIComponent(source.imageId) +
                '/forensics?type=' + encodeURIComponent(currentTool) +
                '&quality=' + quality + '&scale=' + scale;
            fetchPromise = fetch(url).then(function (res) {
                if (!res.ok) throw new Error('Forensic analysis failed (HTTP ' + res.status + ').');
                return res.blob();
            });
        } else if (source.file) {
            if (Saka.state && Saka.state.previewUrl) {
                baseImg.src = Saka.state.previewUrl;
            } else {
                baseImg.src = URL.createObjectURL(source.file);
            }

            const formData = new FormData();
            formData.append('image', source.file);
            formData.append('type', currentTool);
            formData.append('quality', quality);
            formData.append('scale', scale);

            fetchPromise = fetch('/api/forensics/analysis', {
                method: 'POST',
                body: formData
            }).then(function (res) {
                if (!res.ok) throw new Error('Forensic analysis failed (HTTP ' + res.status + ').');
                return res.blob();
            });
        }

        if (fetchPromise) {
            fetchPromise
                .then(function (blob) {
                    if (heatImg.dataset.blobUrl) {
                        URL.revokeObjectURL(heatImg.dataset.blobUrl);
                    }
                    const url = URL.createObjectURL(blob);
                    heatImg.dataset.blobUrl = url;
                    heatImg.src = url;
                    updateDivider(50);
                })
                .catch(function (err) {
                    if (Saka.setStatus) Saka.setStatus('Forensics error: ' + err.message, 'error');
                })
                .finally(function () {
                    btnRecompute.disabled = false;
                    btnRecompute.textContent = 'Recompute';
                });
        }

        panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    Saka.openForensics = computeForensic;

    /* ── Main Form Button Trigger ────────────────────────── */

    if (btnInspect) {
        btnInspect.addEventListener('click', function () {
            if (Saka.state && Saka.state.file) {
                computeForensic({ file: Saka.state.file });
            }
        });
    }

    // Global listener for any [data-forensics-id] buttons
    document.addEventListener('click', function (e) {
        const trigger = e.target.closest('[data-forensics-id]');
        if (trigger) {
            e.preventDefault();
            const id = trigger.getAttribute('data-forensics-id');
            if (id) computeForensic({ imageId: id });
        }
    });
})();
