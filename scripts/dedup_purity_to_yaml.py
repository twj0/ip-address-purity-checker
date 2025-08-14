import logging
import sys
import os
import re
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Dict, List, Optional, Tuple

# Ensure 'src' is importable by adding project root
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from src.ip_checker.subscription import (
    read_subscription_links,
    collect_proxies_from_links,
    resolve_host_to_ips,
    is_valid_hostname_or_ip,
)
from src.ip_checker.ip_utils import fetch_ip_info, is_pure_ip
from src.ip_checker.clash import build_config_from_proxies, save_config


logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# 降低第三方库的日志级别
logging.getLogger("requests").setLevel(logging.WARNING)
logging.getLogger("urllib3").setLevel(logging.WARNING)


def _is_ipv4_literal(value: str) -> bool:
    return bool(re.fullmatch(r"(\d{1,3}\.){3}\d{1,3}", value)) and all(0 <= int(p) <= 255 for p in value.split('.'))


def _resolve_proxy_ipv4(proxy: Dict) -> Optional[str]:
    server = str(proxy.get("server", ""))
    if not server:
        return None
    if _is_ipv4_literal(server):
        return server
    if not is_valid_hostname_or_ip(server):
        return None
    ips = resolve_host_to_ips(server)
    return sorted(ips)[0] if ips else None


def _fetch_ipinfo_with_retry(ip: str, max_retries: int = 2, base_delay: float = 1.0) -> Optional[Dict]:
    """
    获取IP信息，使用智能重试策略
    """
    attempt = 0
    last_error = None

    while attempt <= max_retries:
        try:
            info = fetch_ip_info(ip)
            if info and info.get('status') == 'success':
                return info
            elif info and info.get('status') == 'fail':
                # API明确返回失败，不需要重试
                logger.debug(f"API returned fail status for {ip}, skipping retries")
                return info
        except Exception as e:
            last_error = e
            logger.debug(f"Exception fetching info for {ip}: {e}")

        if attempt < max_retries:
            # 智能退避策略
            if "429" in str(last_error) or "rate limit" in str(last_error).lower():
                sleep_seconds = base_delay * (3 ** attempt) + 2
            else:
                sleep_seconds = base_delay * (2 ** attempt)

            logger.debug(f"Retrying IP info for {ip} in {sleep_seconds:.1f}s (attempt {attempt + 1}/{max_retries + 1})")
            time.sleep(sleep_seconds)

        attempt += 1

    logger.warning(f"Failed to fetch info for {ip} after {max_retries + 1} attempts. Last error: {last_error}")
    return None


def run_dedup_purity_to_yaml(sub_file: str = "汇聚订阅.txt", output_yaml: str = "dedup_purity_clash.yml") -> Tuple[int, int, str]:
    """
    读取订阅链接 → 解析所有代理 → 解析 server 到 IPv4 → 按 IP 去重 → 并发获取 IP 信息并判定纯净 →
    在代理项上打标（country/countryCode/city/isp/org/as/purity/ip）→ 生成 Clash YAML。

    返回 (原始代理数, 去重后代理数, 输出文件路径)。
    """
    links = read_subscription_links(sub_file)
    if not links:
        logger.warning("No subscription links found. Nothing to do.")
        return (0, 0, output_yaml)

    # 1) 收集所有代理（已按 name 去重）
    proxies = collect_proxies_from_links(links)
    total_before = len(proxies)
    if total_before == 0:
        logger.warning("No proxies parsed from subscriptions.")
        return (0, 0, output_yaml)

    logger.info(f"Collected {total_before} proxies. Resolving to IPv4 and de-duplicating by IP...")

    # 2) 解析每个 proxy 的 IPv4，并按 IP 去重
    resolved_map: Dict[str, Dict] = {}  # ip -> proxy
    with ThreadPoolExecutor(max_workers=32) as ex:
        future_to_idx = {ex.submit(_resolve_proxy_ipv4, p): i for i, p in enumerate(proxies)}
        for future in as_completed(future_to_idx):
            idx = future_to_idx[future]
            proxy = proxies[idx]
            try:
                ip = future.result()
            except Exception as e:
                logger.debug(f"Resolve error for proxy '{proxy.get('name')}': {e}")
                ip = None

            if not ip:
                continue
            # 只保留首个出现的该 IP 对应的代理
            if ip not in resolved_map:
                # 暂存已解析的 IP 供后续写入
                proxy_copy = dict(proxy)
                proxy_copy["ip"] = ip
                resolved_map[ip] = proxy_copy

    deduped_proxies = list(resolved_map.values())
    total_after = len(deduped_proxies)
    logger.info(f"De-duplicated proxies by IPv4: {total_before} -> {total_after}")

    if total_after == 0:
        logger.warning("No proxies remained after IP deduplication.")
        return (total_before, 0, output_yaml)

    # 3) 并发获取 IP 信息并判定纯净 (降低并发数避免速率限制)
    unique_ips = [p["ip"] for p in deduped_proxies]
    ip_info_map: Dict[str, Dict] = {}

    # 根据IP数量动态调整并发数
    max_workers = min(10, len(unique_ips))  # 最多10个并发
    logger.info(f"Using {max_workers} workers for {len(unique_ips)} unique IPs")

    with ThreadPoolExecutor(max_workers=max_workers) as ex:
        future_to_ip = {ex.submit(_fetch_ipinfo_with_retry, ip): ip for ip in unique_ips}
        for future in as_completed(future_to_ip):
            ip = future_to_ip[future]
            info = future.result() or {}
            ip_info_map[ip] = info

    # 4) 在代理项上附加标注（purity 等）
    for proxy in deduped_proxies:
        ip = proxy.get("ip")
        info = ip_info_map.get(ip, {})
        proxy["purity"] = "pure" if is_pure_ip(info) else "non-pure"
        proxy["country"] = info.get("country")
        proxy["countryCode"] = info.get("countryCode")
        proxy["city"] = info.get("city")
        proxy["isp"] = info.get("isp")
        proxy["org"] = info.get("org")
        proxy["as"] = info.get("as")

    # 5) 生成 Clash YAML（包含按 purity/country 的分组）
    clash_conf = build_config_from_proxies(deduped_proxies)
    save_config(clash_conf, output_yaml)
    logger.info(f"Saved deduplicated & annotated Clash YAML to: {output_yaml}")

    return (total_before, total_after, output_yaml)


if __name__ == "__main__":
    before, after, path = run_dedup_purity_to_yaml()
    # 退出码不强制依照纯净数量，这里只做生成产物
    logger.info(f"Done. Proxies: {before} -> {after}. Output: {path}")


