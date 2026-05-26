/* ============================================
   AuditScan — app.js
   Logique principale : appels API, affichage
   ============================================ */

// URL de l'API FastAPI (à changer si déployée ailleurs)
const API_URL = 'http://localhost:8000';

// Historique des scans (stocké en mémoire)
let scanHistory = JSON.parse(localStorage.getItem('auditHistory') || '[]');

// Données du dernier scan (pour l'export PDF)
let lastScanData   = null;
let lastScanDomain = null;

// ============================================
// NAVIGATION
// ============================================

document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', () => {
        document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
        item.classList.add('active');

        const section = item.dataset.section;

        document.getElementById('section-scan').style.display    = 'none';
        document.getElementById('section-history').style.display = 'none';

        document.getElementById(`section-${section}`).style.display = 'block';

        if (section === 'history') renderHistory();
    });
});

// ============================================
// PARTICULES (fond animé)
// ============================================

(function initParticles() {
    const canvas = document.getElementById('particles');
    const ctx    = canvas.getContext('2d');
    let particles = [];

    function resize() {
        canvas.width  = window.innerWidth;
        canvas.height = window.innerHeight;
    }

    function createParticle() {
        return {
            x: Math.random() * canvas.width,
            y: Math.random() * canvas.height,
            vx: (Math.random() - 0.5) * 0.3,
            vy: (Math.random() - 0.5) * 0.3,
            size: Math.random() * 1.5 + 0.5,
            opacity: Math.random() * 0.4 + 0.1
        };
    }

    function init() {
        resize();
        particles = Array.from({ length: 60 }, createParticle);
    }

    function draw() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        particles.forEach(p => {
            p.x += p.vx;
            p.y += p.vy;

            if (p.x < 0 || p.x > canvas.width)  p.vx *= -1;
            if (p.y < 0 || p.y > canvas.height) p.vy *= -1;

            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(0, 212, 255, ${p.opacity})`;
            ctx.fill();
        });

        particles.forEach((a, i) => {
            particles.slice(i + 1).forEach(b => {
                const dist = Math.hypot(a.x - b.x, a.y - b.y);
                if (dist < 120) {
                    ctx.beginPath();
                    ctx.moveTo(a.x, a.y);
                    ctx.lineTo(b.x, b.y);
                    ctx.strokeStyle = `rgba(0, 212, 255, ${0.05 * (1 - dist / 120)})`;
                    ctx.lineWidth = 0.5;
                    ctx.stroke();
                }
            });
        });

        requestAnimationFrame(draw);
    }

    window.addEventListener('resize', resize);
    init();
    draw();
})();

// ============================================
// RACCOURCIS CLAVIER
// ============================================

document.getElementById('domain-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') launchScan();
});

// ============================================
// REMPLIR LE CHAMP DEPUIS LES HINTS
// ============================================

function fillDomain(domain) {
    document.getElementById('domain-input').value = domain;
    document.getElementById('domain-input').focus();
}

// ============================================
// LANCER LE SCAN
// ============================================

async function launchScan() {
    const domain = document.getElementById('domain-input').value.trim();

    if (!domain) {
        shakeInput();
        return;
    }

    const cleanDomain = domain
        .replace(/^https?:\/\//, '')
        .replace(/^www\./, '')
        .split('/')[0];

    document.getElementById('domain-input').value = cleanDomain;

    document.getElementById('results-section').style.display = 'none';
    document.getElementById('loading-section').style.display = 'block';
    document.getElementById('loading-domain-name').textContent = `Analyse de ${cleanDomain}...`;

    const btn = document.getElementById('scan-btn');
    btn.classList.add('loading');
    btn.querySelector('.scan-btn-text').textContent = 'SCAN...';

    const steps = ['dns', 'ssl', 'http', 'ports', 'perf', 'tech'];
    animateSteps(steps);

    try {
        const response = await fetch(`${API_URL}/scan?domain=${cleanDomain}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });

        if (!response.ok) throw new Error(`Erreur API: ${response.status}`);

        const data = await response.json();

        steps.forEach(s => markStepDone(s));
        await sleep(500);

        document.getElementById('loading-section').style.display = 'none';
        document.getElementById('results-section').style.display = 'block';

        // Sauvegarde pour l'export PDF
        lastScanData   = data;
        lastScanDomain = cleanDomain;

        renderResults(cleanDomain, data);
        saveToHistory(cleanDomain, data);

    } catch (error) {
        console.warn('API non disponible, affichage des données de démonstration:', error);

        steps.forEach(s => markStepDone(s));
        await sleep(500);

        document.getElementById('loading-section').style.display = 'none';
        document.getElementById('results-section').style.display = 'block';

        const mockData = getMockData(cleanDomain);

        // Sauvegarde pour l'export PDF
        lastScanData   = mockData;
        lastScanDomain = cleanDomain;

        renderResults(cleanDomain, mockData);
    }

    btn.classList.remove('loading');
    btn.querySelector('.scan-btn-text').textContent = 'LANCER';
}

// ============================================
// DONNÉES DE DÉMO (quand l'API est hors ligne)
// ============================================

function getMockData(domain) {
    const seed = domain.length;
    return {
        score: 72,
        dns: {
            A: ['104.21.45.67', '172.67.189.92'],
            MX: ['mail.example.com'],
            TXT: ['v=spf1 include:_spf.google.com ~all'],
            SPF: true,
            DKIM: false,
            DMARC: true
        },
        technologies: {
            cms: seed % 4 === 0 ? 'WordPress' : seed % 4 === 1 ? 'Shopify' : seed % 4 === 2 ? 'PrestaShop' : null,
            frameworks_js: seed % 3 === 0 ? ['React', 'jQuery'] : seed % 3 === 1 ? ['Vue.js'] : ['jQuery'],
            server: seed % 2 === 0 ? 'Nginx' : 'Apache',
            language: seed % 3 === 0 ? 'PHP 8.2' : seed % 3 === 1 ? 'Node.js (Express)' : 'Python',
            cdn: seed % 4 === 0 ? 'Cloudflare' : null,
            analytics: seed % 2 === 0 ? ['Google Analytics / GTM'] : [],
            raw_detected: ['WordPress', 'React', 'Nginx'].slice(0, (seed % 3) + 1)
        },
        ssl: {
            valid: true,
            expiry_date: '2025-11-15T00:00:00',
            cert_type: "Let's Encrypt",
            tls_version: 'TLSv1.3'
        },
        http: {
            hsts: true,
            csp: false,
            x_frame: true,
            x_content_type: true
        },
        ports: [
            { port: 80,  service: 'http',  state: 'open' },
            { port: 443, service: 'https', state: 'open' },
        ],
        performance: {
            load_time_ms: 820,
            page_size_kb: 245,
            score: 80
        },
        issues: [
            { severity: 'medium', description: 'DKIM absent — risque de spoofing email' },
            { severity: 'medium', description: 'CSP absent — risque d\'injection XSS' },
        ]
    };
}

// ============================================
// ANIMATION DES ÉTAPES DE CHARGEMENT
// ============================================

async function animateSteps(steps) {
    for (const step of steps) {
        markStepRunning(step);
        await sleep(600 + Math.random() * 1400);
    }
}

function markStepRunning(stepName) {
    const el = document.getElementById(`step-${stepName}`);
    if (!el) return;
    el.classList.remove('done');
    el.classList.add('active');
    el.querySelector('.step-status').className = 'step-status running';
    el.querySelector('.step-status').textContent = 'en cours...';
}

function markStepDone(stepName) {
    const el = document.getElementById(`step-${stepName}`);
    if (!el) return;
    el.classList.remove('active');
    el.classList.add('done');
    el.querySelector('.step-status').className = 'step-status done';
    el.querySelector('.step-status').textContent = '✓ terminé';
}

// ============================================
// AFFICHAGE DES RÉSULTATS
// ============================================

function renderResults(domain, data) {

    document.getElementById('results-domain-name').textContent = domain;
    document.getElementById('results-date').textContent =
        'Scanné le ' + new Date().toLocaleDateString('fr-FR', {
            day: '2-digit', month: 'long', year: 'numeric',
            hour: '2-digit', minute: '2-digit'
        });

    renderScore(data.score);
    renderDNS(data.dns);
    renderSSL(data.ssl);
    renderHTTP(data.http);
    renderPorts(data.ports);
    renderPerformance(data.performance);
    renderIssues(data.issues);
    renderTechnologies(data.technologies);

    // ── BOUTON PDF ──────────────────────────────────────────────────
    // Cherche s'il y a déjà un bouton PDF (pour éviter les doublons)
    let pdfBtn = document.getElementById('pdf-export-btn');
    if (!pdfBtn) {
        // Crée le bouton et l'insère juste après le bouton "Exporter JSON"
        // (adapte le sélecteur si ton bouton JSON a un autre id/classe)
        pdfBtn = document.createElement('button');
        pdfBtn.id        = 'pdf-export-btn';
        pdfBtn.onclick   = exportPDF;
        pdfBtn.innerHTML = '📄 Rapport PDF';
        // Mets le même style que ton bouton d'export existant
        pdfBtn.style.cssText = `
            margin-left: 10px;
            padding: 8px 18px;
            background: #e74c3c;
            color: white;
            border: none;
            border-radius: 8px;
            font-size: 13px;
            font-weight: bold;
            cursor: pointer;
            letter-spacing: 0.05em;
        `;

        // Insère le bouton à côté du bouton "Exporter JSON"
        // Cherche le bouton JSON par son onclick ou sa classe
        const jsonBtn = document.querySelector('[onclick="exportReport()"]');
        if (jsonBtn && jsonBtn.parentNode) {
            jsonBtn.parentNode.insertBefore(pdfBtn, jsonBtn.nextSibling);
        } else {
            // Fallback : ajoute à la fin de results-section
            document.getElementById('results-section').appendChild(pdfBtn);
        }
    }
    // ────────────────────────────────────────────────────────────────
}

// --- Score ---
function renderScore(score) {
    const numEl   = document.getElementById('score-number');
    const ringEl  = document.getElementById('score-ring-fill');
    const gradeEl = document.getElementById('score-grade');

    const circumference = 2 * Math.PI * 50;

    let current = 0;
    const duration = 1200;
    const startTime = performance.now();

    function update(now) {
        const elapsed  = now - startTime;
        const progress = Math.min(elapsed / duration, 1);
        const eased    = 1 - Math.pow(1 - progress, 3);

        current = Math.round(score * eased);
        numEl.textContent = current;

        const offset = circumference - (current / 100) * circumference;
        ringEl.style.strokeDashoffset = offset;

        if (progress < 1) requestAnimationFrame(update);
    }

    requestAnimationFrame(update);

    let gradeText, gradeClass, ringColor;
    if (score >= 80) {
        gradeText = 'EXCELLENT';  gradeClass = 'grade-excellent'; ringColor = '#00ff88';
    } else if (score >= 60) {
        gradeText = 'BON';        gradeClass = 'grade-good';      ringColor = '#00d4ff';
    } else if (score >= 40) {
        gradeText = 'MOYEN';      gradeClass = 'grade-average';   ringColor = '#ffb347';
    } else {
        gradeText = 'CRITIQUE';   gradeClass = 'grade-poor';      ringColor = '#ff4560';
    }

    gradeEl.textContent = gradeText;
    gradeEl.className = `score-grade ${gradeClass}`;
    ringEl.style.stroke = ringColor;
    document.getElementById('score-number').style.color = ringColor;
}

// --- DNS ---
function renderDNS(dns) {
    const badgesEl  = document.getElementById('dns-badges');
    const detailsEl = document.getElementById('dns-details');
    const statusEl  = document.getElementById('dns-status');

    const checks = [
        { key: 'SPF',   ok: dns.SPF,   label: 'SPF'   },
        { key: 'DKIM',  ok: dns.DKIM,  label: 'DKIM'  },
        { key: 'DMARC', ok: dns.DMARC, label: 'DMARC' },
    ];

    const passCount = checks.filter(c => c.ok).length;

    statusEl.textContent = `${passCount}/3`;
    statusEl.className = `module-status ${passCount === 3 ? 'ok' : passCount >= 2 ? 'warn' : 'fail'}`;

    badgesEl.innerHTML = checks.map(c =>
        `<span class="badge ${c.ok ? 'ok' : 'fail'}">${c.label}</span>`
    ).join('');

    detailsEl.innerHTML = [
        { key: 'Adresses IP (A)',    val: (dns.A  || []).join(', ') || '—' },
        { key: 'Serveurs mail (MX)', val: (dns.MX || []).join(', ') || '—' },
    ].map(r =>
        `<div class="detail-row">
            <span class="detail-key">${r.key}</span>
            <span class="detail-val">${r.val}</span>
        </div>`
    ).join('');
}

// --- SSL ---
function renderSSL(ssl) {
    const badgesEl  = document.getElementById('ssl-badges');
    const detailsEl = document.getElementById('ssl-details');
    const statusEl  = document.getElementById('ssl-status');

    let daysLeft = null;
    let expiryStr = '—';
    if (ssl.expiry_date) {
        const expiry = new Date(ssl.expiry_date);
        daysLeft  = Math.ceil((expiry - new Date()) / (1000 * 60 * 60 * 24));
        expiryStr = expiry.toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
    }

    statusEl.textContent = ssl.valid ? 'VALIDE' : 'INVALIDE';
    statusEl.className = `module-status ${ssl.valid ? 'ok' : 'fail'}`;

    badgesEl.innerHTML = `
        <span class="badge ${ssl.valid ? 'ok' : 'fail'}">Certificat ${ssl.valid ? 'valide' : 'invalide'}</span>
        <span class="badge ${ssl.tls_version && ssl.tls_version.includes('1.3') ? 'ok' : 'info'}">${ssl.tls_version || 'TLS inconnu'}</span>
        ${daysLeft !== null ? `<span class="badge ${daysLeft > 30 ? 'ok' : daysLeft > 7 ? 'info' : 'fail'}">${daysLeft}j restants</span>` : ''}
    `;

    detailsEl.innerHTML = [
        { key: 'Expiration',         val: expiryStr,               cls: daysLeft > 30 ? 'good' : daysLeft > 7 ? 'warn' : 'bad' },
        { key: 'Type de certificat', val: ssl.cert_type || '—',    cls: '' },
        { key: 'Version TLS',        val: ssl.tls_version || '—',  cls: ssl.tls_version && ssl.tls_version.includes('1.3') ? 'good' : 'warn' },
    ].map(r =>
        `<div class="detail-row">
            <span class="detail-key">${r.key}</span>
            <span class="detail-val ${r.cls}">${r.val}</span>
        </div>`
    ).join('');
}

// --- HTTP ---
function renderHTTP(http) {
    const badgesEl = document.getElementById('http-badges');
    const statusEl = document.getElementById('http-status');

    const headers = [
        { key: 'hsts',           label: 'HSTS',            ok: http.hsts },
        { key: 'csp',            label: 'CSP',             ok: http.csp },
        { key: 'x_frame',        label: 'X-Frame-Options', ok: http.x_frame },
        { key: 'x_content_type', label: 'X-Content-Type',  ok: http.x_content_type },
    ];

    const passCount = headers.filter(h => h.ok).length;
    statusEl.textContent = `${passCount}/4`;
    statusEl.className = `module-status ${passCount === 4 ? 'ok' : passCount >= 2 ? 'warn' : 'fail'}`;

    badgesEl.innerHTML = headers.map(h =>
        `<span class="badge ${h.ok ? 'ok' : 'fail'}">${h.label}</span>`
    ).join('');

    document.getElementById('http-details').innerHTML = '';
}

// --- Ports ---
function renderPorts(ports) {
    const wrapperEl = document.getElementById('ports-table-wrapper');
    const statusEl  = document.getElementById('ports-status');

    const dangerousPorts = [21, 22, 23, 25, 3306, 3389, 5900, 6379, 8080, 27017];

    if (!ports || ports.length === 0) {
        statusEl.textContent = 'AUCUN';
        statusEl.className = 'module-status ok';
        wrapperEl.innerHTML = '<div class="ports-empty">✓ Aucun port exposé détecté</div>';
        return;
    }

    const openCount   = ports.length;
    const dangerCount = ports.filter(p => dangerousPorts.includes(p.port)).length;
    statusEl.textContent = `${openCount} ouverts`;
    statusEl.className = `module-status ${dangerCount > 0 ? 'warn' : 'ok'}`;

    wrapperEl.innerHTML = `
        <table class="ports-table">
            <thead>
                <tr>
                    <th>PORT</th>
                    <th>SERVICE</th>
                    <th>ÉTAT</th>
                    <th>RISQUE</th>
                </tr>
            </thead>
            <tbody>
                ${ports.map(p => {
                    const isDangerous = dangerousPorts.includes(p.port);
                    return `<tr>
                        <td class="port-number">${p.port}</td>
                        <td class="port-service">${p.service}</td>
                        <td class="${p.state === 'open' ? 'port-state' : 'port-warn'}">${p.state}</td>
                        <td class="${isDangerous ? 'port-warn' : 'port-state'}">${isDangerous ? 'Dangereux' : 'OK'}</td>
                    </tr>`;
                }).join('')}
            </tbody>
        </table>
    `;
}

// --- Performance ---
function renderPerformance(perf) {
    const metricsEl = document.getElementById('perf-metrics');
    const statusEl  = document.getElementById('perf-status');

    if (!perf || !perf.load_time_ms) {
        statusEl.textContent = 'N/A';
        metricsEl.innerHTML = '<div class="detail-row"><span class="detail-key">Non disponible</span></div>';
        return;
    }

    const score = perf.score || 0;
    statusEl.textContent = `${score}/100`;
    statusEl.className = `module-status ${score >= 80 ? 'ok' : score >= 50 ? 'warn' : 'fail'}`;

    const metrics = [
        {
            label: 'Temps de chargement',
            value: `${perf.load_time_ms} ms`,
            barPct: Math.max(0, 100 - (perf.load_time_ms / 30)),
            cls: perf.load_time_ms < 500 ? 'good' : perf.load_time_ms < 1500 ? 'warn' : 'bad'
        },
        {
            label: 'Taille de la page',
            value: `${perf.page_size_kb} Ko`,
            barPct: Math.max(0, 100 - (perf.page_size_kb / 20)),
            cls: perf.page_size_kb < 500 ? 'good' : perf.page_size_kb < 1500 ? 'warn' : 'bad'
        },
        {
            label: 'Score performance',
            value: `${score} / 100`,
            barPct: score,
            cls: score >= 80 ? 'good' : score >= 50 ? 'warn' : 'bad'
        }
    ];

    metricsEl.innerHTML = metrics.map(m => `
        <div class="perf-metric">
            <div class="perf-label">
                <span>${m.label}</span>
                <span class="perf-value">${m.value}</span>
            </div>
            <div class="perf-bar-bg">
                <div
                    class="perf-bar-fill ${m.cls}"
                    style="width: 0%"
                    data-target="${Math.min(100, m.barPct).toFixed(1)}"
                ></div>
            </div>
        </div>
    `).join('');

    setTimeout(() => {
        document.querySelectorAll('.perf-bar-fill').forEach(bar => {
            bar.style.width = bar.dataset.target + '%';
        });
    }, 200);
}

// --- Issues ---
function renderIssues(issues) {
    const listEl  = document.getElementById('issues-list');
    const countEl = document.getElementById('issues-count');

    countEl.textContent = issues.length;

    if (!issues || issues.length === 0) {
        listEl.innerHTML = '<div class="no-issues">✓ Aucun problème critique détecté</div>';
        return;
    }

    const severityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
    const sorted = [...issues].sort((a, b) =>
        (severityOrder[a.severity] ?? 4) - (severityOrder[b.severity] ?? 4)
    );

    listEl.innerHTML = sorted.map(issue => `
        <div class="issue-item ${issue.severity}">
            <div class="issue-dot"></div>
            <div class="issue-content">
                <div class="issue-severity">${issue.severity.toUpperCase()}</div>
                <div class="issue-desc">${issue.description}</div>
            </div>
        </div>
    `).join('');
}

// --- Technologies ---
function renderTechnologies(tech) {
    const badgesEl  = document.getElementById('tech-badges');
    const detailsEl = document.getElementById('tech-details');
    const statusEl  = document.getElementById('tech-status');

    if (!tech) {
        statusEl.textContent = 'N/A';
        return;
    }

    const detected = tech.raw_detected || [];
    statusEl.textContent = detected.length > 0 ? `${detected.length} détectés` : 'Aucun';
    statusEl.className = `module-status ${detected.length > 0 ? 'ok' : 'warn'}`;

    const badges = [];
    if (tech.cms)
        badges.push(`<span class="badge ok">${tech.cms}</span>`);
    (tech.frameworks_js || []).forEach(fw =>
        badges.push(`<span class="badge info">${fw}</span>`)
    );
    if (tech.server)
        badges.push(`<span class="badge info">${tech.server}</span>`);
    if (tech.cdn)
        badges.push(`<span class="badge info">CDN: ${tech.cdn}</span>`);

    badgesEl.innerHTML = badges.length > 0 ? badges.join('') : '<span class="badge fail">Rien détecté</span>';

    const rows = [
        { key: 'CMS',           val: tech.cms       || 'Non détecté' },
        { key: 'Frameworks JS', val: (tech.frameworks_js || []).join(', ') || 'Aucun' },
        { key: 'Serveur',       val: tech.server    || 'Masqué' },
        { key: 'Langage',       val: tech.language  || 'Non détecté' },
        { key: 'CDN',           val: tech.cdn       || 'Aucun' },
        { key: 'Analytics',     val: (tech.analytics || []).join(', ') || 'Aucun' },
    ];

    detailsEl.innerHTML = rows.map(r =>
        `<div class="detail-row">
            <span class="detail-key">${r.key}</span>
            <span class="detail-val">${r.val}</span>
        </div>`
    ).join('');
}

// ============================================
// RESET
// ============================================

function resetScan() {
    document.getElementById('results-section').style.display = 'none';
    document.getElementById('domain-input').value = '';
    document.getElementById('domain-input').focus();

    ['dns', 'ssl', 'http', 'ports', 'perf'].forEach(s => {
        const el = document.getElementById(`step-${s}`);
        if (!el) return;
        el.classList.remove('active', 'done');
        el.querySelector('.step-status').className = 'step-status pending';
        el.querySelector('.step-status').textContent = 'en attente';
    });
}

// ============================================
// EXPORT RAPPORT JSON (fonction existante)
// ============================================

function exportReport() {
    const domain = document.getElementById('results-domain-name').textContent;
    const date   = new Date().toISOString().slice(0, 10);
    const score  = document.getElementById('score-number').textContent;

    const report = {
        domaine: domain,
        date: date,
        score: parseInt(score),
        genere_par: 'AuditScan v1.0'
    };

    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `audit-${domain}-${date}.json`;
    a.click();
    URL.revokeObjectURL(url);
}

// ============================================
// EXPORT RAPPORT PDF  ← NOUVEAU
// ============================================

function exportPDF() {
    // Vérifie que jsPDF est bien chargé
    if (typeof window.jspdf === 'undefined') {
        alert('Erreur : la librairie jsPDF n\'est pas chargée. Vérifie le <script> dans index.html.');
        return;
    }

    const { jsPDF } = window.jspdf;
    const doc  = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const data = lastScanData;
    const domain = lastScanDomain || document.getElementById('results-domain-name').textContent;
    const date   = new Date().toLocaleDateString('fr-FR', {
        day: '2-digit', month: 'long', year: 'numeric',
        hour: '2-digit', minute: '2-digit'
    });
    const score  = parseInt(document.getElementById('score-number').textContent) || 0;

    const W = 210; // largeur A4 en mm

    // ── Helpers dessin ──────────────────────────────────────────────

    // Dessine un rectangle arrondi rempli
    function filledRect(x, y, w, h, hex) {
        doc.setFillColor(...hexToRgb(hex));
        doc.roundedRect(x, y, w, h, 2, 2, 'F');
    }

    // Convertit un code hexa en [r, g, b]
    function hexToRgb(hex) {
        const r = parseInt(hex.slice(1,3),16);
        const g = parseInt(hex.slice(3,5),16);
        const b = parseInt(hex.slice(5,7),16);
        return [r, g, b];
    }

    // Couleur selon le score
    function scoreHex(s) {
        if (s >= 80) return '#00c853';
        if (s >= 60) return '#00b0ff';
        if (s >= 40) return '#ffb300';
        return '#f44336';
    }

    // Texte centré horizontalement
    function centerText(text, y, size, hex) {
        doc.setFontSize(size);
        doc.setTextColor(...hexToRgb(hex));
        doc.text(text, W / 2, y, { align: 'center' });
    }

    // Ligne horizontale
    function hLine(y, hex = '#dddddd') {
        doc.setDrawColor(...hexToRgb(hex));
        doc.line(14, y, W - 14, y);
    }

    // Pastille OK / KO
    function badge(x, y, ok) {
        filledRect(x, y - 3.5, 16, 5, ok ? '#e8f5e9' : '#ffebee');
        doc.setFontSize(7);
        doc.setTextColor(...hexToRgb(ok ? '#2e7d32' : '#c62828'));
        doc.text(ok ? '✓ OK' : '✗ KO', x + 8, y, { align: 'center' });
    }

    // ── En-tête ──────────────────────────────────────────────────────
    // Bande bleue en haut
    filledRect(0, 0, W, 32, '#0d1b2a');

    doc.setFontSize(20);
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.text('AUDIT REPORT', 14, 14);

    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(180, 210, 255);
    doc.text(domain, 14, 22);
    doc.text(`Généré le ${date}`, W - 14, 22, { align: 'right' });

    // Logo texte à droite
    doc.setFontSize(13);
    doc.setTextColor(0, 212, 255);
    doc.setFont('helvetica', 'bold');
    doc.text('AuditScan', W - 14, 13, { align: 'right' });

    // ── Score global ─────────────────────────────────────────────────
    let y = 42;
    filledRect(14, y, W - 28, 28, '#f8f9fa');

    // Grand score à gauche
    doc.setFontSize(36);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...hexToRgb(scoreHex(score)));
    doc.text(`${score}`, 30, y + 20);

    doc.setFontSize(13);
    doc.setTextColor(100, 100, 100);
    doc.setFont('helvetica', 'normal');
    doc.text('/ 100', 30 + doc.getTextWidth(`${score}`) + 2, y + 20);

    // Grade
    const grade = score >= 80 ? 'EXCELLENT' : score >= 60 ? 'BON' : score >= 40 ? 'MOYEN' : 'CRITIQUE';
    filledRect(75, y + 9, 30, 10, scoreHex(score));
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(255, 255, 255);
    doc.text(grade, 90, y + 16, { align: 'center' });

    // Barre de progression du score
    const barX = 115;
    filledRect(barX, y + 10, 70, 6, '#e0e0e0');
    filledRect(barX, y + 10, 70 * score / 100, 6, scoreHex(score));

    doc.setFontSize(7);
    doc.setTextColor(120, 120, 120);
    doc.setFont('helvetica', 'normal');
    doc.text('Score de sécurité', barX, y + 8);

    // ── Section DNS ───────────────────────────────────────────────────
    y += 36;
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(30, 30, 30);
    doc.text('DNS', 14, y);
    hLine(y + 2);

    y += 8;
    if (data && data.dns) {
        const dns = data.dns;

        // Badges SPF / DKIM / DMARC
        [
            { label: 'SPF',   ok: dns.SPF },
            { label: 'DKIM',  ok: dns.DKIM },
            { label: 'DMARC', ok: dns.DMARC },
        ].forEach((item, i) => {
            const bx = 14 + i * 42;
            filledRect(bx, y - 4, 38, 10, item.ok ? '#e8f5e9' : '#ffebee');
            doc.setFontSize(8);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(...hexToRgb(item.ok ? '#2e7d32' : '#c62828'));
            doc.text(`${item.ok ? '✓' : '✗'} ${item.label}`, bx + 19, y + 2, { align: 'center' });
        });

        y += 14;
        doc.setFontSize(8);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(80, 80, 80);
        doc.text(`Adresses IP (A) :  ${(dns.A || []).join(', ') || '—'}`, 14, y);
        y += 5;
        doc.text(`Serveurs mail (MX) :  ${(dns.MX || []).join(', ') || '—'}`, 14, y);
    }

    // ── Section SSL ───────────────────────────────────────────────────
    y += 10;
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(30, 30, 30);
    doc.text('SSL / Certificat', 14, y);
    hLine(y + 2);

    y += 8;
    if (data && data.ssl) {
        const ssl = data.ssl;

        let daysLeft = null;
        let expiryStr = '—';
        if (ssl.expiry_date) {
            const expiry = new Date(ssl.expiry_date);
            daysLeft  = Math.ceil((expiry - new Date()) / (1000 * 60 * 60 * 24));
            expiryStr = expiry.toLocaleDateString('fr-FR');
        }

        const sslItems = [
            { label: 'Certificat',    val: ssl.valid ? 'Valide'        : 'Invalide',    ok: ssl.valid },
            { label: 'Version TLS',   val: ssl.tls_version || '—',                      ok: ssl.tls_version && ssl.tls_version.includes('1.3') },
            { label: 'Expiration',    val: expiryStr,                                   ok: daysLeft > 30 },
            { label: 'Jours restants',val: daysLeft !== null ? `${daysLeft} jours` : '—', ok: daysLeft > 30 },
        ];

        sslItems.forEach((item, i) => {
            const col  = i % 2;
            const row  = Math.floor(i / 2);
            const cx   = 14 + col * 93;
            const cy   = y + row * 10;

            doc.setFontSize(7);
            doc.setTextColor(130, 130, 130);
            doc.setFont('helvetica', 'normal');
            doc.text(item.label.toUpperCase(), cx, cy);

            doc.setFontSize(9);
            doc.setTextColor(...hexToRgb(item.ok ? '#2e7d32' : '#c62828'));
            doc.setFont('helvetica', 'bold');
            doc.text(item.val, cx, cy + 5);
        });
        y += 22;
    }

    // ── Section HTTP Headers ──────────────────────────────────────────
    y += 4;
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(30, 30, 30);
    doc.text('Headers HTTP de sécurité', 14, y);
    hLine(y + 2);

    y += 8;
    if (data && data.http) {
        const http = data.http;
        const httpItems = [
            { label: 'HSTS',           ok: http.hsts },
            { label: 'CSP',            ok: http.csp },
            { label: 'X-Frame-Options',ok: http.x_frame },
            { label: 'X-Content-Type', ok: http.x_content_type },
        ];

        httpItems.forEach((item, i) => {
            const bx = 14 + i * 47;
            filledRect(bx, y - 4, 43, 10, item.ok ? '#e8f5e9' : '#ffebee');
            doc.setFontSize(8);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(...hexToRgb(item.ok ? '#2e7d32' : '#c62828'));
            doc.text(`${item.ok ? '✓' : '✗'} ${item.label}`, bx + 21, y + 2, { align: 'center' });
        });
        y += 14;
    }

    // ── Section Performance ───────────────────────────────────────────
    y += 4;
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(30, 30, 30);
    doc.text('Performance', 14, y);
    hLine(y + 2);

    y += 8;
    if (data && data.performance) {
        const perf = data.performance;
        const perfItems = [
            { label: 'Temps de chargement', val: `${perf.load_time_ms} ms` },
            { label: 'Taille de la page',   val: `${perf.page_size_kb} Ko` },
            { label: 'Score performance',   val: `${perf.score} / 100` },
        ];

        perfItems.forEach((item, i) => {
            const cx = 14 + i * 62;
            doc.setFontSize(7);
            doc.setTextColor(130, 130, 130);
            doc.setFont('helvetica', 'normal');
            doc.text(item.label.toUpperCase(), cx, y);
            doc.setFontSize(10);
            doc.setTextColor(30, 30, 30);
            doc.setFont('helvetica', 'bold');
            doc.text(item.val, cx, y + 6);
        });
        y += 16;
    }

    // ── Section Technologies ──────────────────────────────────────────
    y += 4;
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(30, 30, 30);
    doc.text('Technologies détectées', 14, y);
    hLine(y + 2);

    y += 8;
    if (data && data.technologies) {
        const tech = data.technologies;
        const techRows = [
            { label: 'CMS',           val: tech.cms || 'Non détecté' },
            { label: 'Frameworks JS', val: (tech.frameworks_js || []).join(', ') || 'Aucun' },
            { label: 'Serveur',       val: tech.server || 'Masqué' },
            { label: 'CDN',           val: tech.cdn || 'Aucun' },
        ];

        techRows.forEach((row, i) => {
            const col = i % 2;
            const rw  = Math.floor(i / 2);
            const cx  = 14 + col * 93;
            const cy  = y + rw * 10;
            doc.setFontSize(7);
            doc.setTextColor(130, 130, 130);
            doc.setFont('helvetica', 'normal');
            doc.text(row.label.toUpperCase(), cx, cy);
            doc.setFontSize(9);
            doc.setTextColor(40, 40, 40);
            doc.setFont('helvetica', 'bold');
            doc.text(row.val, cx, cy + 5);
        });
        y += 22;
    }

    // ── Section Problèmes détectés ────────────────────────────────────
    y += 4;
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(30, 30, 30);
    doc.text('Problèmes détectés', 14, y);
    hLine(y + 2);

    y += 8;
    if (data && data.issues && data.issues.length > 0) {
        const sevColor = { critical: '#b71c1c', high: '#e53935', medium: '#f57c00', low: '#1976d2' };
        data.issues.forEach(issue => {
            const hex = sevColor[issue.severity] || '#666666';
            filledRect(14, y - 3.5, 22, 5, hex + '22');
            doc.setFontSize(7);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(...hexToRgb(hex));
            doc.text(issue.severity.toUpperCase(), 25, y, { align: 'center' });

            doc.setFontSize(8);
            doc.setFont('helvetica', 'normal');
            doc.setTextColor(50, 50, 50);
            doc.text(issue.description, 40, y);
            y += 7;
        });
    } else {
        doc.setFontSize(9);
        doc.setTextColor(46, 125, 50);
        doc.setFont('helvetica', 'normal');
        doc.text('✓ Aucun problème critique détecté', 14, y);
        y += 7;
    }

    // ── Pied de page ──────────────────────────────────────────────────
    filledRect(0, 287, W, 10, '#0d1b2a');
    doc.setFontSize(7);
    doc.setTextColor(180, 210, 255);
    doc.setFont('helvetica', 'normal');
    doc.text('AuditScan v1.0 — Rapport généré automatiquement', W / 2, 293, { align: 'center' });

    // ── Téléchargement ────────────────────────────────────────────────
    const filename = `audit-${domain}-${new Date().toISOString().slice(0,10)}.pdf`;
    doc.save(filename);
}

// ============================================
// HISTORIQUE
// ============================================

function saveToHistory(domain, data) {
    const entry = {
        domain,
        score: data.score,
        date: new Date().toISOString(),
        issues: (data.issues || []).length
    };

    scanHistory = scanHistory.filter(e => e.domain !== domain);
    scanHistory.unshift(entry);
    if (scanHistory.length > 20) scanHistory = scanHistory.slice(0, 20);

    localStorage.setItem('auditHistory', JSON.stringify(scanHistory));
}

function renderHistory() {
    const grid = document.getElementById('history-grid');

    if (scanHistory.length === 0) {
        grid.innerHTML = '<div class="history-empty">Aucun scan enregistré pour le moment.</div>';
        return;
    }

    const scoreColor = s => s >= 80 ? 'var(--accent2)' : s >= 60 ? 'var(--accent)' : s >= 40 ? '#ffb347' : 'var(--accent3)';

    grid.innerHTML = scanHistory.map(entry => `
        <div class="history-card" onclick="loadFromHistory('${entry.domain}')">
            <div class="history-domain">${entry.domain}</div>
            <div class="history-meta">
                ${new Date(entry.date).toLocaleDateString('fr-FR', {
                    day: '2-digit', month: 'short', year: 'numeric',
                    hour: '2-digit', minute: '2-digit'
                })}
                · ${entry.issues} problème${entry.issues > 1 ? 's' : ''}
            </div>
            <div class="history-score">
                <div class="history-score-num" style="color: ${scoreColor(entry.score)}">${entry.score}</div>
                <div class="history-score-label">/ 100</div>
            </div>
        </div>
    `).join('');
}

function loadFromHistory(domain) {
    document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
    document.querySelector('[data-section="scan"]').classList.add('active');
    document.getElementById('section-history').style.display = 'none';
    document.getElementById('section-scan').style.display    = 'block';
    document.getElementById('domain-input').value = domain;
    launchScan();
}

// ============================================
// UTILITAIRES
// ============================================

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function shakeInput() {
    const input = document.getElementById('domain-input').parentElement;
    input.style.transition = 'transform 0.1s';
    const steps = [5, -5, 4, -4, 3, -3, 0];
    steps.forEach((v, i) => {
        setTimeout(() => input.style.transform = `translateX(${v}px)`, i * 60);
    });
}