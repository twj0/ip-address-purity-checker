import logging
from urllib.parse import quote, urlparse
import requests
import yaml

# Use absolute import for the config within the package
from .config import config

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)

# --- Clash API Interaction ---

def get_api_headers() -> dict:
    """Constructs headers for Clash API requests."""
    headers = {}
    if config.get("secret"):
        headers["Authorization"] = f'Bearer {config["secret"]}'
    return headers

def fetch_proxies() -> list:
    """Fetches and filters the list of available proxies from the Clash API."""
    try:
        headers = get_api_headers()
        response = requests.get(f'{config["external_controller"]}/proxies', headers=headers)
        response.raise_for_status()
        proxies = response.json().get("proxies", {})
        logger.info(f"Retrieved {len(proxies)} total proxies/groups from API.")

        # Filter out non-proxy types (selectors, groups, etc.)
        non_proxy_types = {
            "LoadBalance", "Selector", "URLTest", "Fallback", "Compatible",
            "Direct", "Reject", "RejectDrop", "Pass"
        }
        filtered_proxies = [
            key for key, value in proxies.items() if value.get("type") not in non_proxy_types
        ]
        logger.info(f"Filtered down to {len(filtered_proxies)} proxies.")

        return filtered_proxies
    except requests.RequestException as e:
        logger.error(f"Error fetching proxy list from Clash API: {e}")
        return []

def delay_test(proxy_group: str, timeout: int = 5000) -> dict:
    """Performs a delay test on a specified proxy group."""
    try:
        headers = get_api_headers()
        url = f'{config["external_controller"]}/group/{quote(proxy_group)}/delay'
        params = {"url": "https://www.google.com/generate_204", "timeout": timeout}
        response = requests.get(url, params=params, headers=headers)
        response.raise_for_status()
        result = response.json()
        logger.info(f"Delay test for group '{proxy_group}' completed, tested {len(result)} proxies.")
        return result
    except requests.RequestException as e:
        logger.error(f"Error during delay test for group '{proxy_group}': {e}")
        return {}

# --- Clash Configuration Generation ---

def build_config_from_proxies(proxies_list: list) -> dict:
    """Builds a full Clash configuration with intelligent grouping."""
    logger.info(f"Building config from a list of {len(proxies_list)} proxies with auto grouping.")

    new_config = {
        "proxies": proxies_list or [],
        "dns": {
            "enable": True,
            "enhanced-mode": "fake-ip",
            "fake-ip-range": "198.18.0.1/16",
            "default-nameserver": ["114.114.114.114", "223.5.5.5", "8.8.8.8"],
            "nameserver": ["https://doh.pub/dns-query"],
        },
        "rules": [
            "DOMAIN-SUFFIX,google.com,✈️ PROXY",
            "DOMAIN-SUFFIX,github.com,✈️ PROXY",
            "MATCH,DIRECT",
        ],
    }

    # Add API controller settings from global config
    try:
        parsed = urlparse(config["external_controller"])
        controller_host_port = parsed.netloc or parsed.path
        if controller_host_port:
            new_config["external-controller"] = controller_host_port
        if config.get("secret"):
            new_config["secret"] = str(config["secret"])
    except Exception as e:
        logger.warning(f"Could not parse external_controller from config: {e}")

    # --- Intelligent Grouping Logic ---
    proxy_groups = []
    proxy_names = [p["name"] for p in proxies_list if p.get("name")]

    if not proxy_names:
        new_config["proxy-groups"] = []
        return new_config

    # 1. Group by Purity
    pure_proxies = [p["name"] for p in proxies_list if p.get("purity") == "pure"]
    non_pure_proxies = [p["name"] for p in proxies_list if p.get("purity") == "non-pure"]

    # 2. Group by Country
    country_groups = {}
    for p in proxies_list:
        country_code = p.get("countryCode", "Unknown").upper()
        if country_code not in country_groups:
            country_groups[country_code] = []
        country_groups[country_code].append(p["name"])

    # 3. Build the proxy-groups list for YAML
    group_selectors = []

    # Add URL Test group for pure nodes
    if pure_proxies:
        proxy_groups.append({
            "name": "⚡ URL-TEST",
            "type": "url-test",
            "url": "http://www.gstatic.com/generate_204",
            "interval": 300,
            "proxies": pure_proxies,
        })
        group_selectors.append("⚡ URL-TEST")

    # Add country groups
    for country_code, names in sorted(country_groups.items()):
        group_name = f"AUTO-{country_code}"
        proxy_groups.append({
            "name": group_name,
            "type": "select",
            "proxies": names,
        })
        group_selectors.append(group_name)

    # Add purity groups
    if pure_proxies:
        proxy_groups.append({"name": "✅ PURE", "type": "select", "proxies": pure_proxies})
        group_selectors.append("✅ PURE")
    if non_pure_proxies:
        proxy_groups.append({"name": "❌ NON-PURE", "type": "select", "proxies": non_pure_proxies})
        group_selectors.append("❌ NON-PURE")

    # 4. Create top-level selector
    proxy_groups.insert(0, {
        "name": "✈️ PROXY",
        "type": "select",
        "proxies": group_selectors,
    })

    new_config["proxy-groups"] = proxy_groups
    logger.info("Finished building new Clash configuration with advanced groups.")
    return new_config

def save_config(clash_config: dict, file_path: str):
    """Saves a Clash configuration dict to a YAML file."""
    logger.info(f"Saving new configuration to: {file_path}")
    try:
        with open(file_path, "w", encoding="utf-8") as f:
            yaml.dump(clash_config, f, allow_unicode=True, sort_keys=False)
        logger.info("Configuration saved successfully.")
    except Exception as e:
        logger.error(f"Error saving configuration to {file_path}: {e}")
        raise
