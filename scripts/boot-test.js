/**
 * Boot verification — starts the real server in-process and probes it.
 * No MongoDB required: verifies HTTP layer + graceful DB-unavailable path.
 *
 * Run:  node scripts/boot-test.js
 */

process.env.NODE_ENV = process.env.NODE_ENV || 'development';

const http = require('http');

require('../server'); // boots (listen + sweeper + non-fatal DB connect)

function request(path, method = 'GET') {
    return new Promise((resolve, reject) => {
        const req = http.request(
            { host: '127.0.0.1', port: process.env.PORT || 3000, path, method },
            (res) => {
                let body = '';
                res.on('data', (c) => { body += c; });
                res.on('end', () => resolve({ status: res.statusCode, body }));
            }
        );
        req.on('error', reject);
        req.setTimeout(8000, () => req.destroy(new Error('request timeout')));
        req.end();
    });
}

async function waitForServer(maxMs = 12000) {
    const deadline = Date.now() + maxMs;
    while (Date.now() < deadline) {
        try {
            return await request('/api/health');
        } catch {
            await new Promise((r) => setTimeout(r, 400));
        }
    }
    throw new Error('server never became reachable');
}

(async () => {
    const results = [];
    let failed = false;

    try {
        const health = await waitForServer();
        const parsed = JSON.parse(health.body);
        const pass = health.status === 200 && parsed.ok === true;
        results.push(`${pass ? 'PASS' : 'FAIL'} · GET /api/health → ${health.status} providers=[${(parsed.providers || []).join(',')}]`);
        failed = failed || !pass;

        const home = await request('/');
        const hasBrand = home.body.includes('Saka-irs');
        const hasHero = home.body.includes('class="hero"') && home.body.includes('not words.');
        const hasFavicon = home.body.includes('/favicon.svg');
        const homeOk = home.status === 200 && hasBrand && hasHero && hasFavicon;
        results.push(`${homeOk ? 'PASS' : 'FAIL'} · GET / → ${home.status} shell=${hasBrand} hero=${hasHero} favicon=${hasFavicon}`);
        failed = failed || !homeOk;

        const searches = await request('/api/searches');
        // No MongoDB running → fast JSON 503 from requireDb is CORRECT behavior.
        const graceful = searches.status === 503 && searches.body.includes('error');
        results.push(`${graceful ? 'PASS' : 'FAIL'} · GET /api/searches (no DB) → ${searches.status} JSON-error=${searches.body.includes('error')}`);

        const notFound = await request('/api/nope');
        results.push(`${notFound.status === 404 ? 'PASS' : 'FAIL'} · GET /api/nope → ${notFound.status}`);

        for (const page of [['/library', 'library-grid'], ['/history', 'history-list']]) {
            const r = await request(page[0]);
            const okPage = r.status === 200 && r.body.includes(page[1]);
            results.push(`${okPage ? 'PASS' : 'FAIL'} · GET ${page[0]} → ${r.status} renders=${okPage}`);
            failed = failed || !okPage;
        }
    } catch (err) {
        results.push(`FAIL · ${err.message}`);
        failed = true;
    }

    console.log('\n──── boot test ────');
    results.forEach((r) => console.log(r));
    console.log('───────────────────');

    process.exit(failed ? 1 : 0);
})();
