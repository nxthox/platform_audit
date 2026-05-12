def calculate_score(dns_results, ssl_results, http_results, ports_results) -> int:
    """
    Calcule un score global sur 100 basé sur tous les modules.
    Chaque catégorie rapporte des points.
    """
    score = 0

    # --- DNS (25 points) ---
    if dns_results.get("SPF"):    score += 8   # SPF présent
    if dns_results.get("DKIM"):   score += 8   # DKIM présent
    if dns_results.get("DMARC"):  score += 9   # DMARC présent (le plus important)

    # --- SSL (30 points) ---
    if ssl_results.get("valid"):  score += 20  # Certificat valide
    tls = ssl_results.get("tls_version", "")
    if "TLSv1.3" in str(tls):    score += 10  # TLS 1.3 = meilleure version
    elif "TLSv1.2" in str(tls):  score += 5   # TLS 1.2 = acceptable

    # --- HTTP Headers (30 points) ---
    if http_results.get("hsts"):           score += 10
    if http_results.get("csp"):            score += 10
    if http_results.get("x_frame"):        score += 5
    if http_results.get("x_content_type"): score += 5

    # --- Ports exposés (15 points) ---
    # Ports dangereux s'ils sont ouverts : Telnet, FTP, RDP...
    dangerous_ports = [21, 23, 3389, 5900, 8080]
    exposed_dangerous = [
        p for p in ports_results
        if p["port"] in dangerous_ports
    ]
    if len(exposed_dangerous) == 0:
        score += 15  # Aucun port dangereux → plein de points
    elif len(exposed_dangerous) <= 2:
        score += 7   # Quelques ports dangereux
    # Sinon 0 points

    return min(score, 100)  # Maximum 100