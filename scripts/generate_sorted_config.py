import logging
import sys
import os
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Dict, List, Tuple

# Add the src directory to the Python path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..')))

from src.ip_checker.subscription import (
    read_subscription_links,
    collect_proxies_from_links,
    resolve_host_to_ips,
)
from src.ip_checker.ip_utils import fetch_ip_info, is_pure_ip, fetch_ip_risk
from src.ip_checker.clash import build_config_from_proxies, save_config

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)

MAX_WORKERS = 20

def get_proxy_ip_and_score(proxy: Dict) -> Tuple[Dict, int]:
    """For a given proxy, resolve its IP and calculate a score based on purity and risk."""
    host = proxy.get("server")
    if not host:
        return proxy, 999  # No host, score it very high to place at the end

    logger.info(f"Processing proxy: {proxy.get('name')} ({host})")
    ips = resolve_host_to_ips(host)
    if not ips:
        logger.warning(f"Could not resolve IP for host: {host}")
        return proxy, 999

    # Use the first resolved IP for checking
    ip = list(ips)[0]
    proxy["server"] = ip  # Replace hostname with resolved IP
    proxy["original_host"] = host # Keep original host for reference

    # Fetch info and calculate score
    ip_info = fetch_ip_info(ip)
    
    # Score calculation
    score = 0
    # 1. Purity check (heavy penalty for non-pure)
    if not is_pure_ip(ip_info):
        score += 100
        proxy['purity'] = 'non-pure'
    else:
        proxy['purity'] = 'pure'

    # 2. Risk check (add scamalytics score)
    risk_info = fetch_ip_risk(ip)
    if risk_info and risk_info.get("score"):
        try:
            risk_score = int(risk_info["score"])
            score += risk_score
            proxy['risk_score'] = risk_score
        except (ValueError, TypeError):
            pass

    logger.info(f"Proxy {proxy.get('name')} ({ip}) scored: {score}")
    return proxy, score

def main():
    """Main execution logic."""
    start_time = time.time()

    # 1. Read subscription links
    links = read_subscription_links("汇聚订阅.txt")
    if not links:
        logger.error("No subscription links found in '汇聚订阅.txt'. Exiting.")
        return

    # 2. Collect all unique proxy configurations
    proxies = collect_proxies_from_links(links)
    if not proxies:
        logger.error("No proxies could be extracted from the subscription links. Exiting.")
        return

    # 3. Concurrently resolve IPs and score all proxies
    scored_proxies = []
    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as executor:
        future_to_proxy = {executor.submit(get_proxy_ip_and_score, proxy): proxy for proxy in proxies}
        for future in as_completed(future_to_proxy):
            try:
                scored_proxy, score = future.result()
                scored_proxies.append((scored_proxy, score))
            except Exception as e:
                logger.error(f"Error scoring proxy: {e}")

    # 4. Sort proxies by score (lower is better)
    scored_proxies.sort(key=lambda x: x[1])
    sorted_proxy_list = [p for p, s in scored_proxies]

    logger.info("--- Top 10 Proxies ---")
    for i, (proxy, score) in enumerate(scored_proxies[:10]):
        logger.info(f"{i+1}. {proxy.get('name')} (Score: {score}, Purity: {proxy.get('purity')}, IP: {proxy.get('server')})")

    # 5. Generate and save the new Clash configuration
    new_clash_config = build_config_from_proxies(sorted_proxy_list)
    save_config(new_clash_config, "sorted_clash.yaml")

    end_time = time.time()
    logger.info(f"Successfully generated 'sorted_clash.yaml' in {end_time - start_time:.2f} seconds.")

if __name__ == "__main__":
    main()
