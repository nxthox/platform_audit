import requests
import time

def scan_performance(domain: str) -> dict:
    """
    Mesure les performances basiques du site :
    - Temps de chargement de la page
    - Taille de la page en Ko
    """
    results = {
        "load_time_ms": None,  # Temps de réponse en millisecondes
        "page_size_kb": None,  # Taille de la page en Ko
        "score": 0             # Score de performance sur 100
    }

    try:
        start = time.time()  # Heure de départ

        response = requests.get(
            f"https://{domain}",
            timeout=15,
            verify=False
        )

        end = time.time()  # Heure d'arrivée

        # Calcule le temps en millisecondes
        load_time_ms = (end - start) * 1000
        results["load_time_ms"] = round(load_time_ms, 2)

        # Taille de la page en Ko
        page_size_kb = len(response.content) / 1024
        results["page_size_kb"] = round(page_size_kb, 2)

        # Calcul du score :
        # < 500ms → 100 pts | < 1s → 80 pts | < 2s → 60 pts | > 2s → 30 pts
        if load_time_ms < 500:
            results["score"] = 100
        elif load_time_ms < 1000:
            results["score"] = 80
        elif load_time_ms < 2000:
            results["score"] = 60
        else:
            results["score"] = 30

    except Exception:
        pass

    return results