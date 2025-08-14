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

# 降低第三方库的日志级别
logging.getLogger("requests").setLevel(logging.WARNING)
logging.getLogger("urllib3").setLevel(logging.WARNING)

def _fetch_ipinfo_with_retry(ip: str, max_retries: int = 2, base_delay: float = 1.0) -> Optional[Dict]:
    """
    Fetches IP info with improved retry strategy.
    使用智能重试策略，根据错误类型调整重试行为
    """
    attempt = 0
    last_error = None

    while attempt <= max_retries:
        try:
            info = fetch_ip_info(ip)
            if info and info.get('status') == 'success':
                return info
            elif info and info.get('status') == 'fail':
                # 如果API明确返回失败，不需要重试
                logger.debug(f"API returned fail status for {ip}, skipping retries")
                return info
        except Exception as e:
            last_error = e
            logger.debug(f"Exception fetching info for {ip}: {e}")

        if attempt < max_retries:
            # 智能退避：根据尝试次数和错误类型调整延迟
            if "429" in str(last_error) or "rate limit" in str(last_error).lower():
                # 速率限制错误，使用更长的延迟
                sleep_seconds = base_delay * (3 ** attempt) + 2
            else:
                # 其他错误，使用标准指数退避
                sleep_seconds = base_delay * (2 ** attempt)

            logger.debug(f"Retrying for {ip} in {sleep_seconds:.1f}s (attempt {attempt + 1}/{max_retries + 1})")
            time.sleep(sleep_seconds)

        attempt += 1

    logger.warning(f"Failed to fetch info for {ip} after {max_retries + 1} attempts. Last error: {last_error}")
    return None

def run_check(links: List[str]) -> int:
    """Returns the number of non-pure IPs found."""
    pairs = collect_ips_from_links(links)
    rows = []
    non_pure_count = 0

    logger.info(f"Found {len(pairs)} (host, ip) pairs. Now fetching IP information...")
    info_results: Dict[str, Dict] = {}

    # 降低并发数以避免速率限制
    max_workers = min(10, len(pairs))  # 最多10个并发，避免过度并发
    logger.info(f"Using {max_workers} workers for IP information fetching")

    with ThreadPoolExecutor(max_workers=max_workers) as ex:
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
