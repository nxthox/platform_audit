import dns.resolver  # Librairie dnspython

def scan_dns(domain: str) -> dict:
    """
    Analyse les enregistrements DNS d'un domaine.
    Retourne un dictionnaire avec les enregistrements trouvés.
    """
    results = {
        "A": [],       # Adresses IP du domaine
        "MX": [],      # Serveurs de mail
        "TXT": [],     # Enregistrements texte (SPF, DKIM...)
        "SPF": False,  # Anti-spam
        "DKIM": False, # Signature mail
        "DMARC": False # Politique anti-usurpation
    }

    # Enregistrement A : adresse IP
    try:
        answers = dns.resolver.resolve(domain, 'A')
        for rdata in answers:
            results["A"].append(str(rdata))
    except Exception:
        pass  # Si ça échoue, on ignore et on continue

    # Enregistrement MX : serveurs mail
    try:
        answers = dns.resolver.resolve(domain, 'MX')
        for rdata in answers:
            results["MX"].append(str(rdata.exchange))
    except Exception:
        pass

    # Enregistrement TXT : contient SPF, DKIM...
    try:
        answers = dns.resolver.resolve(domain, 'TXT')
        for rdata in answers:
            txt = str(rdata)
            results["TXT"].append(txt)
            if "v=spf1" in txt:
                results["SPF"] = True   # SPF trouvé
            if "v=DKIM1" in txt:
                results["DKIM"] = True  # DKIM trouvé

    except Exception:
        pass

    # DMARC : enregistrement spécial sur _dmarc.domaine.com
    try:
        answers = dns.resolver.resolve(f"_dmarc.{domain}", 'TXT')
        for rdata in answers:
            if "v=DMARC1" in str(rdata):
                results["DMARC"] = True
    except Exception:
        pass

    return results