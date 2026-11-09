/**
 * Saka-irs client — results rendering (§26 categories, §34 payload shape).
 * Plain vanilla JS; renders entirely client-side from the JSON API.
 */
(function () {
    'use strict';

    if (!window.Saka) return;
    const Saka = window.Saka;

    const panel = document.getElementById('results-panel');
    const strip = document.getElementById('provider-strip');
    const container = document.getElementById('results-container');
    const template = document.getElementById('result-card-template');

    var CATEGORY_TITLES = {
        duplicates: 'EXACT / NEAR DUPLICATES',
        resemblance: 'VISUAL RESEMBLANCE',
        specialized: 'SPECIALIZED DOMAIN & GEO-OSINT',
        discovery: 'WEB DISCOVERY / EXTERNAL CORPUS'
    };

    function providerPill(name, info) {
        const pill = document.createElement('span');
        pill.className = 'pill ' + (info.status === 'ok' ? 'ok' : info.status);
        let text = name + ': ' + info.status;
        if (info.status === 'ok' && typeof info.resultCount === 'number') {
            text += ' (' + info.resultCount + ')';
        }
        if (info.error) {
            pill.title = info.error;
        }
        if (!info.error && info.reason) {
            pill.title = info.reason;
            text += '*';
        }
        pill.textContent = text;
        return pill;
    }

    function fillCard(card, result) {
        const link = card.querySelector('.thumb-link');
        const img = card.querySelector('.thumb');
        img.alt = result.title || 'result';
        link.href = result.sourceUrl || result.imageUrl || '#';
        if (link.href.endsWith('#')) {
            link.removeAttribute('href');
        } else if (result.sourceType !== 'local') {
            link.target = '_blank';
            link.rel = 'noopener noreferrer';
        }
        img.src = result.imageUrl || '';

        card.querySelector('.result-title').textContent =
            result.title || result.sourceUrl || '(untitled)';

        const typeBadge = card.querySelector('.badge.matchtype');
        typeBadge.textContent = result.matchType.replace(/_/g, ' ');

        const confBadge = card.querySelector('.badge.confidence');
        confBadge.classList.add(result.confidence);
        confBadge.textContent = result.confidence;

        const meta = [];
        meta.push(result.provider + ' · ' + result.matchMethod.replace(/_/g, ' '));

        const meterWrap = card.querySelector('.distance-meter');
        if (result.distance !== null && result.distance !== undefined) {
            meta.push('pHash distance: ' + result.distance);
            if (meterWrap) {
                meterWrap.classList.remove('hidden');
                const fill = meterWrap.querySelector('.meter-fill');
                const text = meterWrap.querySelector('.meter-text');
                const pct = Math.max(0, Math.min(100, Math.round((1 - result.distance / 64) * 100)));
                fill.style.width = pct + '%';
                fill.className = 'meter-fill ' + (result.distance <= 6 ? 'strong' : result.distance <= 12 ? 'moderate' : 'weak');
                text.textContent = result.distance + '/64 dist (' + pct + '% match)';
            }
        }

        if (result.foundVia.length > 1) {
            meta.push('found via: ' + result.foundVia.join(' + '));
        }
        if (result.metadata) {
            if (result.metadata.biome) meta.push('Biome: ' + result.metadata.biome);
            if (result.metadata.scientificName) meta.push('Taxon: ' + result.metadata.scientificName);
            if (result.metadata.timezoneOffset && result.metadata.timezoneOffset !== 'Unknown') {
                meta.push('Timezone: ' + result.metadata.timezoneOffset);
            }
        }
        card.querySelector('.result-meta').textContent = meta.join(' · ');

        // Action links: Details and Forensics for local, Visit Source for external
        const btnDetails = card.querySelector('.btn-details');
        const btnForensics = card.querySelector('.btn-forensics');
        const btnExt = card.querySelector('.btn-ext-link');

        if (result.sourceType === 'local' && result.id) {
            if (btnDetails) {
                btnDetails.classList.remove('hidden');
                btnDetails.setAttribute('data-meta-id', result.id);
            }
            if (btnForensics) {
                btnForensics.classList.remove('hidden');
                btnForensics.setAttribute('data-forensics-id', result.id);
            }
        } else if (result.sourceUrl && btnExt) {
            btnExt.classList.remove('hidden');
            btnExt.href = result.sourceUrl;
        }
    }

    Saka.renderResults = function (payload) {
        Saka.show(panel);
        strip.innerHTML = '';
        container.innerHTML = '';

        Object.keys(payload.providers || {}).forEach(function (name) {
            strip.appendChild(providerPill(name, payload.providers[name]));
        });

        const categories = payload.categories || {};
        let totalRendered = 0;

        Object.keys(CATEGORY_TITLES).forEach(function (key) {
            const items = categories[key] || [];
            const section = document.createElement('div');
            section.className = 'category';

            const title = document.createElement('h3');
            title.className = 'category-title';
            title.textContent = CATEGORY_TITLES[key] +
                (items.length ? '  (' + items.length + ')' : '');
            section.appendChild(title);

            if (items.length === 0) {
                const empty = document.createElement('p');
                empty.className = 'empty-note';
                if (key === 'discovery') {
                    const failed = [];
                    Object.keys(payload.providers || {}).forEach(function (pName) {
                        const p = payload.providers[pName];
                        if (p && p.status === 'failed') {
                            failed.push(pName + ' (' + (p.error || 'unavailable') + ')');
                        }
                    });
                    if (failed.length > 0) {
                        empty.textContent = 'External providers were temporarily unavailable: ' + failed.join(' · ') + '. Your local library results are unaffected.';
                    } else if (payload.providers && payload.providers['external-corpus'] && payload.providers['external-corpus'].status === 'skipped') {
                        empty.textContent = 'External archive search was skipped because no contextual hints were provided. Enter a keyword (e.g. "safari") or location in the hints box to search public archives.';
                    } else {
                        empty.textContent = 'No external archive matches found for this query.';
                    }
                } else if (key === 'duplicates') {
                    empty.textContent = 'No matching image found in your local library. Click "Add to Library" on the upload form to index it into your searchable database.';
                } else if (key === 'specialized') {
                    empty.textContent = 'No geographic origin or biological taxonomy patterns detected for this query.';
                } else {
                    empty.textContent = 'Nothing in this category.';
                }
                section.appendChild(empty);
            } else {
                const grid = document.createElement('div');
                grid.className = 'result-grid';
                items.forEach(function (result) {
                    const card = template.content.firstElementChild.cloneNode(true);
                    fillCard(card, result);
                    grid.appendChild(card);
                    totalRendered++;
                });
                section.appendChild(grid);
            }

            container.appendChild(section);
        });

        if (totalRendered === 0) {
            const note = document.createElement('p');
            note.className = 'empty-note';
            note.textContent =
                'No visual matches found. Add images to your library to build search history.';
            container.appendChild(note);
        }

        panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };

    Saka.showResultsError = function () {
        Saka.show(panel);
        strip.innerHTML = '';
        container.innerHTML =
            '<p class="empty-note">The search could not complete — see the message above.</p>';
    };
})();
