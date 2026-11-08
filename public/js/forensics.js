/**
 * Saka-irs client — Digital Forensics (ELA) Workspace (Layout 3).
 * Interactive A/B split slider, parameters adjustment, and live tampering analysis.
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

    let currentSource = null; // { file } or { imageId }
    let isDragging = false;
    let dividerPos = 50; // percentage
    let isFullHeatmap = false;

    /* ── Split Slider Engine ─────────────────────────────── */

    function updateDivider(percent) {
        dividerPos = Math.max(0, Math.min(100, percent));
        divider.style.left = dividerPos + '%';
        // Clip the heatmap overlay from the left divider position to 100%
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
            btnToggle.textContent = 'Show Full ELA';
        }
    });

    btnRecompute.addEventListener('click', function () {
        if (currentSource) computeELA(currentSource);
    });

    /* ── Computation & Fetching ──────────────────────────── */

    function computeELA(source) {
        currentSource = source;
        const quality = qualitySelect ? qualitySelect.value : '90';
        const scale = scaleSelect ? scaleSelect.value : '20';

        Saka.show(panel);
        btnRecompute.disabled = true;
        btnRecompute.textContent = 'Analyzing…';

        let fetchPromise;

        if (source.imageId) {
            // Fetch from stored image endpoint
            baseImg.src = '/api/images/' + encodeURIComponent(source.imageId) + '/thumbnail';
            const elaUrl = '/api/images/' + encodeURIComponent(source.imageId) + '/ela?quality=' + quality + '&scale=' + scale;
            fetchPromise = fetch(elaUrl).then(function (res) {
                if (!res.ok) throw new Error('Failed to generate ELA.');
                return res.blob();
            });
        } else if (source.file) {
            // Direct upload computation
            if (Saka.state && Saka.state.previewUrl) {
                baseImg.src = Saka.state.previewUrl;
            } else {
                baseImg.src = URL.createObjectURL(source.file);
            }

            const formData = new FormData();
            formData.append('image', source.file);
            formData.append('quality', quality);
            formData.append('scale', scale);

            fetchPromise = fetch('/api/forensics/ela', {
                method: 'POST',
                body: formData
            }).then(function (res) {
                if (!res.ok) throw new Error('Forensic analysis failed.');
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
                    if (Saka.setStatus) Saka.setStatus('Forensic ELA error: ' + err.message, 'error');
                })
                .finally(function () {
                    btnRecompute.disabled = false;
                    btnRecompute.textContent = 'Recompute';
                });
        }

        panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    Saka.openForensics = computeELA;

    /* ── Main Form Button Trigger ────────────────────────── */

    if (btnInspect) {
        btnInspect.addEventListener('click', function () {
            if (Saka.state && Saka.state.file) {
                computeELA({ file: Saka.state.file });
            }
        });
    }

    // Global listener for any [data-forensics-id] buttons
    document.addEventListener('click', function (e) {
        const trigger = e.target.closest('[data-forensics-id]');
        if (trigger) {
            e.preventDefault();
            const id = trigger.getAttribute('data-forensics-id');
            if (id) computeELA({ imageId: id });
        }
    });
})();

