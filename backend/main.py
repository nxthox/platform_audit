from fastapi import FastAPI, Depends
from sqlalchemy.orm import Session
from backend.database import engine, Base, get_db
from backend import models
from backend.modules import dns_scan, ssl_scan, http_scan, port_scan, perf_scan, scoring, tech_scan
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