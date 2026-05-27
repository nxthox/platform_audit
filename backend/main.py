from fastapi import FastAPI, Depends
from sqlalchemy.orm import Session
from database import engine, Base, get_db
import models
from modules import dns_scan, ssl_scan, http_scan, port_scan, perf_scan, scoring, tech_scan
from fastapi.middleware.cors import CORSMiddleware


# Crée toutes les tables dans PostgreSQL si elles n'existent pas
Base.metadata.create_all(bind=engine)

# Crée l'application FastAPI
app = FastAPI(title="Audit Platform", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],   # Autorise toutes les origines (dev uniquement)
    allow_methods=["*"],
    allow_headers=["*"],
)

# ──────────────────────────────────────────────
# POST /scan : Lance un scan complet d'un domaine
# ──────────────────────────────────────────────
@app.post("/scan")
def launch_scan(domain: str, db: Session = Depends(get_db)):
    # 1. Sauvegarde le domaine en BDD
    db_domain = models.Domain(domain=domain)
    db.add(db_domain)
    db.commit()
    db.refresh(db_domain)

    # 2. Crée un enregistrement de scan
    db_scan = models.Scan(domain_id=db_domain.id)
    db.add(db_scan)
    db.commit()
    db.refresh(db_scan)

    scan_id = db_scan.id

    # 3. Lance tous les modules d'analyse
    dns_results  = dns_scan.scan_dns(domain)
    ssl_results  = ssl_scan.scan_ssl(domain)
    http_results = http_scan.scan_http(domain)
    port_results = port_scan.scan_ports(domain)
    perf_results = perf_scan.scan_performance(domain)
    tech_results = tech_scan.scan_technologies(domain)

    # 4. Sauvegarde les résultats DNS
    for record_type in ["A", "MX", "TXT"]:
        for val in dns_results.get(record_type, []):
            db.add(models.ResultDns(scan_id=scan_id, record_type=record_type, value=val))

    # 5. Sauvegarde les résultats SSL
    db.add(models.ResultSsl(
        scan_id=scan_id,
        valid=ssl_results["valid"],
        expiry_date=ssl_results["expiry_date"],
        cert_type=ssl_results["cert_type"],
        tls_version=ssl_results["tls_version"]
    ))

    # 6. Sauvegarde les résultats HTTP
    db.add(models.ResultHttp(
        scan_id=scan_id,
        hsts=http_results["hsts"],
        csp=http_results["csp"],
        x_frame=http_results["x_frame"],
        x_content_type=http_results["x_content_type"]
    ))

    # 7. Sauvegarde les ports détectés
    for port in port_results:
        db.add(models.ResultPort(
            scan_id=scan_id,
            port=port["port"],
            service=port["service"],
            state=port["state"]
        ))

    # 8. Génère les issues (problèmes détectés)
    issues = []
    if not dns_results.get("SPF"):
        issues.append({"severity": "medium", "description": "SPF absent"})
    if not dns_results.get("DKIM"):
        issues.append({"severity": "medium", "description": "DKIM absent"})
    if not dns_results.get("DMARC"):
        issues.append({"severity": "high", "description": "DMARC absent"})
    if not ssl_results.get("valid"):
        issues.append({"severity": "critical", "description": "Certificat SSL invalide ou absent"})
    if not http_results.get("hsts"):
        issues.append({"severity": "high", "description": "HSTS absent"})
    if not http_results.get("csp"):
        issues.append({"severity": "medium", "description": "CSP absent"})

    for issue in issues:
        db.add(models.Issue(scan_id=scan_id, **issue))

    db.commit()

    # 9. Calcule le score final
    final_score = scoring.calculate_score(dns_results, ssl_results, http_results, port_results)

    return {
        "scan_id": scan_id,
        "domain": domain,
        "score": final_score,
        "dns": dns_results,
        "ssl": ssl_results,
        "http": http_results,
        "ports": port_results,
        "performance": perf_results,
        "technologies": tech_results,
        "issues": issues
    }

# ──────────────────────────────────────────────
# GET /scan/{id} : Récupère les résultats d'un scan
# ──────────────────────────────────────────────
@app.get("/scan/{scan_id}")
def get_scan(scan_id: int, db: Session = Depends(get_db)):
    scan = db.query(models.Scan).filter(models.Scan.id == scan_id).first()
    if not scan:
        return {"error": "Scan non trouvé"}
    dns = db.query(models.ResultDns).filter(models.ResultDns.scan_id == scan_id).all()
    ssl = db.query(models.ResultSsl).filter(models.ResultSsl.scan_id == scan_id).first()
    http = db.query(models.ResultHttp).filter(models.ResultHttp.scan_id == scan_id).first()
    ports = db.query(models.ResultPort).filter(models.ResultPort.scan_id == scan_id).all()
    issues = db.query(models.Issue).filter(models.Issue.scan_id == scan_id).all()
    return {"scan_id": scan_id, "dns": dns, "ssl": ssl, "http": http, "ports": ports, "issues": issues}

# ──────────────────────────────────────────────
# GET /domains : Liste tous les domaines scannés
# ──────────────────────────────────────────────
@app.get("/domains")
def list_domains(db: Session = Depends(get_db)):
    domains = db.query(models.Domain).all()
    return domains

from fastapi.responses import FileResponse
from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
from reportlab.lib.styles import getSampleStyleSheet
import tempfile, os

@app.get("/report/{scan_id}")
def generate_report(scan_id: int, db: Session = Depends(get_db)):
    scan = db.query(models.Scan).filter_by(id=scan_id).first()
    if not scan:
        raise HTTPException(404, "Scan non trouvé")

    dns  = scan.dns_results
    ssl  = scan.ssl_results
    http = scan.http_results

    # Créer un fichier PDF temporaire
    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=".pdf")
    doc = SimpleDocTemplate(tmp.name, pagesize=A4)
    styles = getSampleStyleSheet()
    elements = []

    # Titre
    elements.append(Paragraph(f"Rapport d'audit — {scan.domain.domain}", styles["Title"]))
    elements.append(Paragraph(f"Date : {scan.date_scan.strftime('%d/%m/%Y %H:%M')}", styles["Normal"]))
    elements.append(Spacer(1, 20))

    # Score global
    elements.append(Paragraph(f"Score global : {scan.global_score}/100", styles["Heading1"]))
    elements.append(Spacer(1, 12))

    # Tableau des scores
    data = [
        ["Catégorie", "Score", "Statut"],
        ["DNS",  f"{dns.score}/100"  if dns  else "N/A", "✓" if dns  and dns.score  >= 70 else "✗"],
        ["SSL",  f"{ssl.score}/100"  if ssl  else "N/A", "✓" if ssl  and ssl.score  >= 70 else "✗"],
        ["HTTP", f"{http.score}/100" if http else "N/A", "✓" if http and http.score >= 70 else "✗"],
    ]
    t = Table(data, colWidths=[200, 100, 80])
    t.setStyle(TableStyle([
        ("BACKGROUND", (0,0), (-1,0), colors.HexColor("#1F3864")),
        ("TEXTCOLOR",  (0,0), (-1,0), colors.white),
        ("FONTNAME",   (0,0), (-1,0), "Helvetica-Bold"),
        ("ALIGN",      (0,0), (-1,-1), "CENTER"),
        ("GRID",       (0,0), (-1,-1), 0.5, colors.grey),
        ("ROWBACKGROUNDS", (0,1), (-1,-1), [colors.whitesmoke, colors.white]),
    ]))
    elements.append(t)
    elements.append(Spacer(1, 20))

    # Détail DNS
    elements.append(Paragraph("Analyse DNS", styles["Heading2"]))
    if dns:
        elements.append(Paragraph(f"SPF : {'✓ Présent' if dns.has_spf else '✗ Absent'}", styles["Normal"]))
        elements.append(Paragraph(f"DKIM : {'✓ Présent' if dns.has_dkim else '✗ Absent'}", styles["Normal"]))
        elements.append(Paragraph(f"DMARC : {'✓ Présent' if dns.has_dmarc else '✗ Absent'}", styles["Normal"]))
    elements.append(Spacer(1, 12))

    # Détail SSL
    elements.append(Paragraph("Certificat SSL", styles["Heading2"]))
    if ssl:
        elements.append(Paragraph(f"Validité : {'✓ Valide' if ssl.is_valid else '✗ Invalide'}", styles["Normal"]))
        elements.append(Paragraph(f"Expire dans : {ssl.days_left} jours", styles["Normal"]))
        elements.append(Paragraph(f"Version TLS : {ssl.tls_version}", styles["Normal"]))
    elements.append(Spacer(1, 12))

    # Détail HTTP
    elements.append(Paragraph("Headers HTTP", styles["Heading2"]))
    if http:
        elements.append(Paragraph(f"HSTS : {'✓' if http.has_hsts else '✗'}", styles["Normal"]))
        elements.append(Paragraph(f"CSP : {'✓' if http.has_csp else '✗'}", styles["Normal"]))
        elements.append(Paragraph(f"X-Frame-Options : {'✓' if http.has_xframe else '✗'}", styles["Normal"]))

    doc.build(elements)

    return FileResponse(
        tmp.name,
        media_type="application/pdf",
        filename=f"audit_{scan.domain.domain}_{scan_id}.pdf",
        background=None
    )