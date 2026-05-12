import ssl
import socket
from datetime import datetime

def scan_ssl(domain: str) -> dict:
    """
    Vérifie le certificat SSL du domaine.
    Se connecte en HTTPS et extrait les infos du certificat.
    """
    results = {
        "valid": False,
        "expiry_date": None,
        "cert_type": None,
        "tls_version": None
    }

    try:
        # Crée un contexte SSL sécurisé (vérifie le certificat)
        context = ssl.create_default_context()

        # Ouvre une connexion HTTPS sur le port 443
        with socket.create_connection((domain, 443), timeout=10) as sock:
            with context.wrap_socket(sock, server_hostname=domain) as ssock:

                # Récupère les infos du certificat
                cert = ssock.getpeercert()

                # Date d'expiration (format : "Nov 10 12:00:00 2025 GMT")
                expiry_str = cert['notAfter']
                expiry_date = datetime.strptime(expiry_str, "%b %d %H:%M:%S %Y %Z")
                results["expiry_date"] = expiry_date
                results["valid"] = expiry_date > datetime.now()  # Encore valide ?

                # Type de certificat (DV, OV, EV) via l'organisation
                subject = dict(x[0] for x in cert['subject'])
                results["cert_type"] = subject.get("organizationName", "DV")

                # Version TLS utilisée
                results["tls_version"] = ssock.version()

    except ssl.SSLCertVerificationError:
        results["valid"] = False  # Certificat invalide ou auto-signé
    except Exception:
        pass  # Pas de HTTPS, connexion refusée, etc.

    return results