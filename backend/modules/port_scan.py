import nmap

def scan_ports(domain: str) -> list:
    """
    Scanne les ports courants du domaine pour détecter
    les services exposés sur internet.
    Retourne une liste de ports ouverts avec leur service.
    """
    results = []

    try:
        nm = nmap.PortScanner()  # Crée un scanner Nmap

        # Scanne les ports les plus courants (-F = Fast scan)
        # Arguments : -T4 = vitesse, -F = ports communs seulement
        nm.scan(domain, arguments='-T4 -F')

        for host in nm.all_hosts():
            for proto in nm[host].all_protocols():  # tcp ou udp
                ports = nm[host][proto].keys()
                for port in ports:
                    state = nm[host][proto][port]['state']   # open/closed
                    service = nm[host][proto][port]['name']  # http, ssh, ftp...
                    if state == 'open':
                        results.append({
                            "port": port,
                            "service": service,
                            "state": state
                        })
    except Exception:
        pass

    return results