import requests
import re

# Désactive les warnings SSL (certificats auto-signés)
import urllib3
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

def scan_technologies(domain: str) -> dict:
    """
    Détecte les technologies utilisées par un site web.
    Analyse le HTML, les headers HTTP et les cookies
    pour identifier le CMS et les frameworks JS.
    """
    results = {
        "cms": None,          # CMS détecté (WordPress, Prestashop, Shopify...)
        "frameworks_js": [],  # Frameworks JS détectés (React, Vue, Angular...)
        "server": None,       # Serveur web (Apache, Nginx...)
        "language": None,     # Langage backend (PHP, Python...)
        "cdn": None,          # CDN détecté (Cloudflare, Fastly...)
        "analytics": [],      # Outils analytics (Google Analytics, Matomo...)
        "raw_detected": []    # Liste complète de tout ce qui est détecté
    }

    try:
        response = requests.get(
            f"https://{domain}",
            timeout=10,
            verify=False,
            allow_redirects=True,
            headers={
                # Simule un vrai navigateur pour éviter les blocages
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
            }
        )

        html    = response.text.lower()   # HTML de la page (en minuscules)
        headers = response.headers        # Headers HTTP
        cookies = response.cookies        # Cookies

        # ─────────────────────────────────────────
        # DÉTECTION CMS
        # ─────────────────────────────────────────

        # WordPress : cherche /wp-content/ ou /wp-includes/ dans le HTML
        if "/wp-content/" in html or "/wp-includes/" in html or "wp-json" in html:
            results["cms"] = "WordPress"
            results["raw_detected"].append("WordPress")

        # PrestaShop : cherche des patterns spécifiques à Prestashop
        elif "/modules/ps_" in html or "prestashop" in html or "/themes/classic/" in html:
            results["cms"] = "PrestaShop"
            results["raw_detected"].append("PrestaShop")

        # Shopify : cherche cdn.shopify.com ou Shopify.theme dans le HTML
        elif "cdn.shopify.com" in html or "shopify.com/s/files" in html or "myshopify.com" in html:
            results["cms"] = "Shopify"
            results["raw_detected"].append("Shopify")

        # Wix : détecté via les URLs de ressources Wix
        elif "static.wixstatic.com" in html or "wix.com" in html:
            results["cms"] = "Wix"
            results["raw_detected"].append("Wix")

        # Squarespace
        elif "squarespace.com" in html or "static1.squarespace.com" in html:
            results["cms"] = "Squarespace"
            results["raw_detected"].append("Squarespace")

        # Joomla : cherche /media/jui/ ou generator meta tag
        elif "/media/jui/" in html or 'content="joomla' in html or "/components/com_" in html:
            results["cms"] = "Joomla"
            results["raw_detected"].append("Joomla")

        # Drupal : cherche /sites/default/files/ ou Drupal.settings
        elif "/sites/default/files/" in html or "drupal.settings" in html or "drupal" in html:
            results["cms"] = "Drupal"
            results["raw_detected"].append("Drupal")

        # Magento
        elif "mage/cookies.js" in html or "magento" in html or "/skin/frontend/" in html:
            results["cms"] = "Magento"
            results["raw_detected"].append("Magento")

        # ─────────────────────────────────────────
        # DÉTECTION FRAMEWORKS JS
        # ─────────────────────────────────────────

        # React : cherche __react ou _react dans le HTML ou data-reactroot
        if "data-reactroot" in html or "__react" in html or "react.development.js" in html \
           or "react.production.min.js" in html or "_reactlistening" in html:
            results["frameworks_js"].append("React")
            results["raw_detected"].append("React")

        # Next.js : souvent utilisé avec React
        if "__next" in html or "/_next/static/" in html or "next/dist" in html:
            results["frameworks_js"].append("Next.js")
            results["raw_detected"].append("Next.js")

        # Vue.js : cherche __vue__ ou vue.min.js
        if "__vue__" in html or "vue.min.js" in html or "vue.runtime" in html \
           or 'data-v-' in html:
            results["frameworks_js"].append("Vue.js")
            results["raw_detected"].append("Vue.js")

        # Nuxt.js (basé sur Vue)
        if "/__nuxt" in html or "_nuxt/" in html or "nuxt.js" in html:
            results["frameworks_js"].append("Nuxt.js")
            results["raw_detected"].append("Nuxt.js")

        # Angular : cherche ng-version ou angular.min.js
        if "ng-version" in html or "angular.min.js" in html or "angular/core" in html \
           or 'ng-app' in html:
            results["frameworks_js"].append("Angular")
            results["raw_detected"].append("Angular")

        # jQuery : très répandu
        if "jquery.min.js" in html or "jquery-" in html or "jquery/dist" in html:
            results["frameworks_js"].append("jQuery")
            results["raw_detected"].append("jQuery")

        # Svelte
        if "__svelte" in html or "svelte" in html:
            results["frameworks_js"].append("Svelte")
            results["raw_detected"].append("Svelte")

        # ─────────────────────────────────────────
        # DÉTECTION SERVEUR WEB (via headers)
        # ─────────────────────────────────────────

        server_header = headers.get("Server", "").lower()
        if "nginx" in server_header:
            results["server"] = "Nginx"
        elif "apache" in server_header:
            results["server"] = "Apache"
        elif "cloudflare" in server_header:
            results["server"] = "Cloudflare"
        elif "iis" in server_header:
            results["server"] = "IIS (Microsoft)"
        elif "lighttpd" in server_header:
            results["server"] = "Lighttpd"
        elif server_header:
            results["server"] = headers.get("Server")

        # ─────────────────────────────────────────
        # DÉTECTION LANGAGE BACKEND (via headers)
        # ─────────────────────────────────────────

        powered_by = headers.get("X-Powered-By", "").lower()
        if "php" in powered_by:
            # Extrait la version PHP si disponible
            php_match = re.search(r"php/([\d.]+)", powered_by)
            results["language"] = f"PHP {php_match.group(1)}" if php_match else "PHP"
        elif "asp.net" in powered_by:
            results["language"] = "ASP.NET"
        elif "express" in powered_by:
            results["language"] = "Node.js (Express)"
        elif "python" in powered_by or "django" in powered_by or "flask" in powered_by:
            results["language"] = "Python"

        # ─────────────────────────────────────────
        # DÉTECTION CDN
        # ─────────────────────────────────────────

        cf_ray = headers.get("CF-Ray", "")        # Header Cloudflare
        via    = headers.get("Via", "").lower()
        x_cache= headers.get("X-Cache", "").lower()

        if cf_ray:
            results["cdn"] = "Cloudflare"
        elif "fastly" in via or "fastly" in x_cache:
            results["cdn"] = "Fastly"
        elif "akamai" in via or "akamaiedge" in headers.get("X-Check-Cacheable","").lower():
            results["cdn"] = "Akamai"
        elif "cloudfront" in x_cache or "cloudfront" in headers.get("X-Amz-Cf-Id",""):
            results["cdn"] = "AWS CloudFront"

        # ─────────────────────────────────────────
        # DÉTECTION ANALYTICS
        # ─────────────────────────────────────────

        if "google-analytics.com" in html or "gtag(" in html or "ga(" in html or "gtm.js" in html:
            results["analytics"].append("Google Analytics / GTM")
        if "matomo" in html or "piwik" in html:
            results["analytics"].append("Matomo")
        if "plausible.io" in html:
            results["analytics"].append("Plausible")
        if "hotjar" in html:
            results["analytics"].append("Hotjar")

    except Exception as e:
        results["error"] = str(e)

    return results