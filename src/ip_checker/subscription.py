import base64
import logging
import re
import socket
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import List, Set, Tuple, Dict, Optional

import requests
import yaml
from urllib.parse import urlparse, parse_qs


logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)

# 并发与超时相关的默认设置（降低并发数以提高稳定性）
MAX_FETCH_WORKERS: int = 5   # 降低订阅获取并发数
MAX_RESOLVE_WORKERS: int = 10  # 降低DNS解析并发数
REQUEST_TIMEOUT_SECONDS: int = 15
RESOLVE_TIMEOUT_SECONDS: int = 6
DOH_TIMEOUT_SECONDS: int = 6


def read_subscription_links(file_path: str = "汇聚订阅.txt") -> List[str]:
    """从本地文本读取订阅链接，一行一个，忽略空行和注释。"""
    try:
        with open(file_path, "r", encoding="utf-8") as f:
            lines = [line.strip() for line in f.readlines()]
        links = [line for line in lines if line and not line.startswith("#")]
        logger.info(f"Loaded {len(links)} subscription links from {file_path}")
        return links
    except FileNotFoundError:
        # 尝试英文名作为备选
        alt = "subscriptions.txt"
        try:
            with open(alt, "r", encoding="utf-8") as f:
                lines = [line.strip() for line in f.readlines()]
            links = [line for line in lines if line and not line.startswith("#")]
            logger.info(f"Loaded {len(links)} subscription links from {alt}")
            return links
        except FileNotFoundError:
            logger.warning("No subscription file found: 汇聚订阅.txt or subscriptions.txt")
            return []


def fetch_text(url: str, timeout: int = REQUEST_TIMEOUT_SECONDS) -> str:
    resp = requests.get(url, timeout=timeout)
    resp.raise_for_status()
    # best effort encoding
    content_type = resp.headers.get("content-type", "")
    if "charset=" in content_type:
        resp.encoding = content_type.split("charset=")[-1]
    else:
        resp.encoding = resp.apparent_encoding or "utf-8"
    return resp.text


def try_base64_decode(text: str) -> str:
    """尝试对文本整体进行Base64解码，失败则原样返回。"""
    try:
        # 清洗空白与换行
        compact = re.sub(r"\s+", "", text)
        decoded = base64.b64decode(compact + "==", validate=False)
        return decoded.decode("utf-8", errors="ignore")
    except Exception:
        return text


def parse_clash_yaml(text: str) -> List[Dict]:
    """解析Clash YAML，返回 proxies 列表（原始字典）。"""
    data = yaml.safe_load(text)
    if not isinstance(data, dict):
        return []
    proxies = data.get("proxies") or []
    return proxies if isinstance(proxies, list) else []


def parse_subscription_lines(text: str) -> List[str]:
    """解析base64订阅解码后的逐行链接，提取原始行。"""
    lines = [line.strip() for line in text.splitlines()]
    return [line for line in lines if line and not line.startswith("#")]


def safe_base64_decode(text: str) -> Optional[str]:
    """对单行做宽松Base64解码，失败返回None。"""
    try:
        compact = re.sub(r"\s+", "", text)
        decoded = base64.b64decode(compact + "==", validate=False)
        return decoded.decode("utf-8", errors="ignore")
    except Exception:
        return None


def is_probable_base64(s: str) -> bool:
    return bool(re.fullmatch(r"[A-Za-z0-9_\-+/=]+", s)) and len(s) >= 16


def is_valid_hostname_or_ip(host: str) -> bool:
    if not host or len(host) > 253 or " " in host:
        return False
    # IPv4 quick check
    if re.fullmatch(r"(\d{1,3}\.){3}\d{1,3}", host):
        parts = [int(p) for p in host.split('.') if p.isdigit()]
        return len(parts) == 4 and all(0 <= p <= 255 for p in parts)
    # Hostname check
    if not re.fullmatch(r"[A-Za-z0-9.-]+", host):
        return False
    for label in host.split('.'):
        if not label or len(label) > 63:
            return False
    return True


def extract_host_from_vmess(uri: str) -> str:
    try:
        b64 = uri.split("vmess://", 1)[-1]
        payload = base64.b64decode(b64 + "==").decode("utf-8", errors="ignore")
        import json

        obj = json.loads(payload)
        return obj.get("add", "")
    except Exception:
        return ""


def extract_host_from_ssr(uri: str) -> str:
    try:
        b64 = uri.split("ssr://", 1)[-1]
        payload = base64.b64decode(b64 + "==").decode("utf-8", errors="ignore")
        # host:port:proto:method:obfs:base64pass/?params
        main = payload.split("/")[0]
        host = main.split(":", 1)[0]
        return host
    except Exception:
        return ""


def extract_host_from_ss(uri: str) -> str:
    try:
        # 两种格式：1) ss://base64  2) ss://method:pass@host:port#name
        parsed = urlparse(uri)
        if parsed.hostname:
            return parsed.hostname
        # 尝试 base64 解码 netloc 或去掉 scheme 后解码
        payload = uri.split("ss://", 1)[-1]
        decoded = base64.b64decode(payload + "==").decode("utf-8", errors="ignore")
        # 形如 method:pass@host:port
        if "@" in decoded:
            after_at = decoded.split("@", 1)[-1]
            host = after_at.split(":", 1)[0]
            return host
        # 形如 host:port
        if ":" in decoded:
            return decoded.split(":", 1)[0]
    except Exception:
        pass
    return ""


def extract_host_from_generic(uri: str) -> str:
    try:
        parsed = urlparse(uri)
        return parsed.hostname or ""
    except Exception:
        return ""


def normalize_line_to_uri(line: str) -> Optional[str]:
    """将单行标准化为可识别的代理URI，无法识别则返回None。支持按行Base64解码。"""
    known = ("vmess://", "vless://", "trojan://", "ss://", "ssr://")
    if line.startswith(known):
        return line
    # 行内Base64尝试
    if is_probable_base64(line):
        decoded = safe_base64_decode(line)
        if decoded and decoded.startswith(known):
            return decoded
        # ss 特例：method:pass@host:port
        if decoded and (":" in decoded and "@" in decoded):
            return "ss://" + base64.b64encode(decoded.encode()).decode()
        # host:port 形式
        if decoded and re.fullmatch(r"[^\s:]+:\d+", decoded):
            return "trojan://user@" + decoded
    # 其它非支持协议的HTTP链接忽略（防止误把URL当作主机）
    return None


def extract_hosts_from_subscription(url: str) -> Set[str]:
    """从一个订阅链接提取所有 server 主机名（或IP）。"""
    text = fetch_text(url)

    # 尝试直接解析成 YAML
    proxies = []
    if "proxies:" in text or "proxy-groups:" in text:
        try:
            proxies = parse_clash_yaml(text)
        except Exception:
            proxies = []

    if not proxies:
        # 尝试整体Base64解码
        decoded_doc = try_base64_decode(text)
        candidate_text = decoded_doc if decoded_doc else text
        # 若仍非YAML，逐行解析已知协议或Base64片段
        if "proxies:" in candidate_text or "proxy-groups:" in candidate_text:
            proxies = parse_clash_yaml(candidate_text)
        else:
            hosts: Set[str] = set()
            for raw in parse_subscription_lines(candidate_text):
                norm = normalize_line_to_uri(raw)
                if not norm:
                    continue
                if norm.startswith("vmess://"):
                    host = extract_host_from_vmess(norm)
                elif norm.startswith("ssr://"):
                    host = extract_host_from_ssr(norm)
                elif norm.startswith("ss://"):
                    host = extract_host_from_ss(norm)
                elif norm.startswith("vless://") or norm.startswith("trojan://"):
                    host = extract_host_from_generic(norm)
                else:
                    host = ""
                if host and is_valid_hostname_or_ip(host):
                    hosts.add(host)
            return hosts

    # 从Clash proxies中提取 server 字段
    hosts: Set[str] = set()
    for p in proxies:
        if isinstance(p, dict) and p.get("server"):
            server = str(p["server"])
            if is_valid_hostname_or_ip(server):
                hosts.add(server)
    return hosts


def _resolve_via_system(host: str) -> Set[str]:
    """使用系统 DNS 解析。只返回 IPv4。"""
    ips: Set[str] = set()
    infos = socket.getaddrinfo(host, None)
    for info in infos:
        sockaddr = info[4]
        if sockaddr and isinstance(sockaddr, tuple):
            ip = sockaddr[0]
            if ":" not in ip:
                ips.add(ip)
    return ips


def _resolve_via_doh_google(host: str, timeout: int = DOH_TIMEOUT_SECONDS) -> Set[str]:
    """使用 Google DNS JSON API 作为 DoH 备用解析，仅返回 A 记录。"""
    try:
        resp = requests.get(
            "https://dns.google/resolve",
            params={"name": host, "type": "A"},
            timeout=timeout,
        )
        resp.raise_for_status()
        data = resp.json()
        answers = data.get("Answer") or []
        ips: Set[str] = set()
        for ans in answers:
            if ans.get("type") == 1 and ans.get("data") and ":" not in str(ans.get("data")):
                ips.add(str(ans["data"]))
        return ips
    except Exception as e:
        logger.debug(f"DoH resolve failed for {host}: {e}")
        return set()


def resolve_host_to_ips(host: str) -> Set[str]:
    """解析主机到 IPv4，优先系统 DNS，失败或超时则回退 DoH。"""
    # 先在独立线程中跑系统解析并设置总体超时
    def _system_job() -> Set[str]:
        return _resolve_via_system(host)

    with ThreadPoolExecutor(max_workers=1) as ex:
        future = ex.submit(_system_job)
        try:
            ips = future.result(timeout=RESOLVE_TIMEOUT_SECONDS)
            if ips:
                return ips
        except Exception as e:
            logger.debug(f"System DNS resolve timeout/fail for {host}: {e}")

    # 备用：DoH（Google JSON）
    ips = _resolve_via_doh_google(host)
    if ips:
        return ips

    logger.warning(f"Failed to resolve {host}: system and DoH both failed")
    return set()


def collect_ips_from_links(links: List[str]) -> List[Tuple[str, str]]:
    """从多个订阅链接并发汇总唯一的 (host, ip) 列表，带解析回退。"""
    results: Set[Tuple[str, str]] = set()
    if not links:
        return []

    # 第一步：并发拉取每个订阅并提取 host 集合
    host_sets: List[Set[str]] = []
    with ThreadPoolExecutor(max_workers=MAX_FETCH_WORKERS) as ex:
        future_to_url = {ex.submit(extract_hosts_from_subscription, url): url for url in links}
        for future in as_completed(future_to_url):
            url = future_to_url[future]
            try:
                hosts = future.result()
                logger.info(f"{url} => {len(hosts)} hosts")
                host_sets.append(hosts)
            except Exception as e:
                logger.error(f"Failed to process {url}: {e}")

    unique_hosts: Set[str] = set()
    for hs in host_sets:
        unique_hosts.update(hs)

    if not unique_hosts:
        return []

    # 第二步：并发解析所有 host -> ip 列表
    with ThreadPoolExecutor(max_workers=MAX_RESOLVE_WORKERS) as ex:
        future_to_host = {ex.submit(resolve_host_to_ips, host): host for host in unique_hosts}
        for future in as_completed(future_to_host):
            host = future_to_host[future]
            try:
                ips = future.result()
                for ip in ips:
                    results.add((host, ip))
            except Exception as e:
                logger.warning(f"Resolve failed for {host}: {e}")

    return sorted(results, key=lambda x: (x[0], x[1]))




def parse_uri_to_clash_proxy(uri: str) -> Optional[Dict]:
    """Converts a proxy URI (ss, vmess, etc.) to a Clash-compatible proxy dictionary."""
    proxy = None
    try:
        if uri.startswith("ss://"):
            # Implement SS URI parsing
            # Example: ss://method:password@server:port#name
            parsed = urlparse(uri)
            name = parsed.fragment if parsed.fragment else "ss_proxy"
            proxy = {
                "name": name,
                "type": "ss",
                "server": parsed.hostname,
                "port": parsed.port,
                "cipher": parsed.username,
                "password": parsed.password,
            }
        elif uri.startswith("vmess://"):
            # Implement Vmess URI parsing
            # Example: vmess://<base64_json>
            b64_payload = uri.split("vmess://", 1)[-1]
            vmess_json = json.loads(base64.b64decode(b64_payload).decode('utf-8'))
            proxy = {
                "name": vmess_json.get("ps", "vmess_proxy"),
                "type": "vmess",
                "server": vmess_json.get("add"),
                "port": vmess_json.get("port"),
                "uuid": vmess_json.get("id"),
                "alterId": vmess_json.get("aid"),
                "cipher": vmess_json.get("scy", "auto"),
                "tls": vmess_json.get("tls") == "tls",
                "network": vmess_json.get("net"),
            }
        # Add other protocols (vless, trojan) here as needed
        
        if proxy and is_valid_hostname_or_ip(proxy.get("server")):
            return proxy

    except Exception as e:
        logger.warning(f"Failed to parse URI '{uri}': {e}")
    
    return None

def extract_proxies_from_subscription(url: str) -> List[Dict]:
    """Fetches a subscription and extracts a list of full proxy configurations."""
    try:
        text = fetch_text(url)
    except Exception as e:
        logger.error(f"Failed to fetch subscription content from {url}: {e}")
        return []

    # Try to parse as Clash YAML first
    if "proxies:" in text or "proxy-groups:" in text:
        try:
            return parse_clash_yaml(text)
        except Exception:
            pass # Fallback to other methods

    # If not YAML, try decoding the whole content as Base64
    decoded_text = try_base64_decode(text)
    
    # Check if the decoded content is a Clash YAML
    if "proxies:" in decoded_text:
        try:
            return parse_clash_yaml(decoded_text)
        except Exception:
            pass

    # Finally, treat as a list of proxy URIs (one per line)
    proxies = []
    lines = parse_subscription_lines(decoded_text)
    for line in lines:
        proxy_dict = parse_uri_to_clash_proxy(line)
        if proxy_dict:
            proxies.append(proxy_dict)
            
    return proxies

def collect_proxies_from_links(links: List[str]) -> List[Dict]:
    """From a list of subscription URLs, concurrently fetch and parse all proxies."""
    all_proxies = []
    unique_proxies = {} # Use dict to handle duplicates by name

    with ThreadPoolExecutor(max_workers=MAX_FETCH_WORKERS) as executor:
        future_to_url = {executor.submit(extract_proxies_from_subscription, url): url for url in links}
        for future in as_completed(future_to_url):
            url = future_to_url[future]
            try:
                proxies = future.result()
                logger.info(f"Got {len(proxies)} proxies from {url}")
                for proxy in proxies:
                    if proxy.get("name") not in unique_proxies:
                        unique_proxies[proxy["name"]] = proxy
            except Exception as e:
                logger.error(f"Error processing subscription {url}: {e}")

    all_proxies = list(unique_proxies.values())
    logger.info(f"Collected {len(all_proxies)} unique proxies in total.")
    return all_proxies

if __name__ == "__main__":
    start_time = time.time()
    links = read_subscription_links()
    # The main logic is now in scripts/, this is for testing
    if links:
        all_proxies = collect_proxies_from_links(links)
        # The rest of the logic (resolving, testing, sorting) would go here
        # For now, just print the collected proxies
        # for proxy in all_proxies:
        #     print(proxy)
    end_time = time.time()
    logger.info(f"Total time: {end_time - start_time:.2f}s")
