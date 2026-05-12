import requests

def scan_http(domain: str) -> dict:
    """
    Analyse les headers de sécurité HTTP du site.
    Ces headers protègent contre différentes attaques web.
    """
    results = {
        "hsts": False,           # Force HTTPS
        "csp": False,            # Empêche injections de scripts
        "x_frame": False,        # Empêche le clickjacking
        "x_content_type": False  # Empêche MIME sniffing
    }

    try:
        # Envoie une requête GET au site
        # verify=False = ignore les erreurs SSL pour ne pas bloquer l'analyse
        response = requests.get(
            f"https://{domain}",
            timeout=10,
            verify=False,
            allow_redirects=True
        )

        headers = response.headers  # Récupère les en-têtes HTTP

        # Vérifie la présence de chaque header de sécurité
        results["hsts"] = "Strict-Transport-Security" in headers
        results["csp"] = "Content-Security-Policy" in headers
        results["x_frame"] = "X-Frame-Options" in headers
        results["x_content_type"] = "X-Content-Type-Options" in headers

    except Exception:
        pass

    return results