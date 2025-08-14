import csv
import logging
import time
import sys
import os
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import List, Dict, Optional

# Add project root to PYTHONPATH so that 'src' is importable
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from src.ip_checker.subscription import read_subscription_links, collect_ips_from_links
from src.ip_checker.ip_utils import fetch_ip_info, is_pure_ip

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)

def _fetch_ipinfo_with_retry(ip: str, max_retries: int = 3, base_delay: float = 0.5) -> Optional[Dict]:
    """
    Fetches IP info with optimized retry for IPinfo.io service.
    使用更温和的重试策略，适配IPinfo.io的更高速率限制
    """
    attempt = 0
    while attempt <= max_retries:
        info = fetch_ip_info(ip)  # 现在会优先使用IPinfo.io
        if info and info.get('status') == 'success':
            return info
        # 更温和的指数退避，适合IPinfo.io
        sleep_seconds = base_delay * (1.5 ** attempt)
        logger.warning(f"Retrying for {ip} in {sleep_seconds:.1f}s...")
        time.sleep(sleep_seconds)
        attempt += 1
    logger.error(f"Failed to fetch info for {ip} after {max_retries + 1} attempts.")
    return None

def run_check(links: List[str]) -> int:
    """Returns the number of non-pure IPs found."""
    pairs = collect_ips_from_links(links)
    rows = []
    non_pure_count = 0

    logger.info(f"Found {len(pairs)} (host, ip) pairs. Now fetching IP information...")
    info_results: Dict[str, Dict] = {}
    with ThreadPoolExecutor(max_workers=50) as ex:
        future_to_ip = {ex.submit(_fetch_ipinfo_with_retry, ip): ip for _, ip in pairs}
        for future in as_completed(future_to_ip):
            ip = future_to_ip[future]
            info = future.result() or {}
            info_results[ip] = info

    logger.info("IP information fetched. Now checking for purity and generating report.")
    for host, ip in pairs:
        info = info_results.get(ip, {})
        pure = is_pure_ip(info)
        if not pure:
            non_pure_count += 1
        rows.append(
            {
                "host": host,
                "ip": ip,
                "pure": "yes" if pure else "no",
                "country": info.get("country", ""),
                "regionName": info.get("regionName", ""),
                "city": info.get("city", ""),
                "isp": info.get("isp", ""),
                "org": info.get("org", ""),
                "as": info.get("as", ""),
            }
        )

    # Write report
    report_path = "subscription_ip_report.csv"
    with open(report_path, "w", newline="", encoding="utf-8-sig") as f:
        writer = csv.DictWriter(
            f,
            fieldnames=["host", "ip", "pure", "country", "regionName", "city", "isp", "org", "as"],
        )
        writer.writeheader()
        writer.writerows(rows)
    
    logger.info(
        f"Checked {len(pairs)} (host, ip) pairs. Non-pure count: {non_pure_count}. Report saved to {report_path}"
    )
    return non_pure_count

if __name__ == "__main__":
    # Assume the script is run from the project root
    links = read_subscription_links("汇聚订阅.txt")
    if not links:
        logger.warning("No subscription links found. Exiting.")
        sys.exit(0)

    non_pure_total = run_check(links)
    
    # Exit with 1 if any non-pure IPs are found, for CI purposes
    exit_code = 1 if non_pure_total > 0 else 0
    sys.exit(exit_code)
