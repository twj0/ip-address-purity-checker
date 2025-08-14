import logging
import ipaddress
import re
import os
from typing import Dict, Optional, Any

import requests
from lxml import html

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# --- Core IP Information Fetching ---

def fetch_ip_info(ip: str, proxy: Optional[Dict] = None, timeout: int = 8) -> Optional[Dict]:
    """
    Fetches IP geolocation and ASN info.
    优先使用IPinfo.io，失败时回退到ip-api.com
    """
    # 首先尝试IPinfo.io
    result = _fetch_ip_info_ipinfo(ip, timeout)
    if result:
        return result

    # 回退到ip-api.com
    logger.info(f'IPinfo failed for {ip}, falling back to ip-api.com')
    return _fetch_ip_info_legacy(ip, proxy, timeout)

def _fetch_ip_info_ipinfo(ip: str, timeout: int = 8) -> Optional[Dict]:
    """使用IPinfo.io获取IP信息"""
    try:
        from .ipinfo_provider import fetch_ip_info_ipinfo
        return fetch_ip_info_ipinfo(ip, timeout)
    except ImportError:
        logger.warning("IPinfo provider not available, using legacy ip-api.com")
        return None
    except Exception as e:
        logger.warning(f'IPinfo.io failed for {ip}: {e}')
        return None

def _fetch_ip_info_legacy(ip: str, proxy: Optional[Dict] = None, timeout: int = 8) -> Optional[Dict]:
    """使用ip-api.com获取IP信息（原始实现）"""
    try:
        logger.info(f'Fetching IP details from ip-api.com for: {ip}')
        response = requests.get(f"http://ip-api.com/json/{ip}", proxies=proxy, timeout=timeout)
        response.raise_for_status()
        return response.json()
    except requests.exceptions.RequestException as e:
        logger.error(f'Error fetching IP details from ip-api.com for {ip}: {e}')
        return None

# --- IP Purity Check ---

def is_pure_ip(ip_info: Optional[Dict]) -> bool:
    """
    Determines if an IP is 'pure' (not from a known cloud/hosting provider).
    支持IPinfo.io的privacy信息和传统的关键词检测
    """
    if not ip_info or ip_info.get("status") != "success":
        return False

    # 优先使用IPinfo.io的privacy信息（更准确）
    if 'privacy' in ip_info or any(key in ip_info for key in ['hosting', 'vpn', 'proxy', 'tor']):
        is_hosting = ip_info.get('hosting', False)
        is_vpn = ip_info.get('vpn', False)
        is_proxy = ip_info.get('proxy', False)
        is_tor = ip_info.get('tor', False)

        # 如果有privacy字典，从中获取信息
        if 'privacy' in ip_info:
            privacy = ip_info['privacy']
            is_hosting = privacy.get('hosting', is_hosting)
            is_vpn = privacy.get('vpn', is_vpn)
            is_proxy = privacy.get('proxy', is_proxy)
            is_tor = privacy.get('tor', is_tor)

        if is_hosting or is_vpn or is_proxy or is_tor:
            logger.warning(f"IP {ip_info.get('query')} marked as non-pure by privacy data: "
                         f"hosting={is_hosting}, vpn={is_vpn}, proxy={is_proxy}, tor={is_tor}")
            return False

        # 如果有privacy信息且都为False，则认为是纯净的
        logger.info(f"IP {ip_info.get('query')} marked as pure by privacy data")
        return True

    # 回退到传统的关键词检测方法
    text_fields = []
    for key in ("isp", "org", "as", "asname", "reverse"):
        value = ip_info.get(key)
        if value:
            text_fields.append(str(value).lower())
    text = " | ".join(text_fields)

    black_keywords = [
        # Cloud / DC / CDN providers
        "alibaba", "alibabacloud", "aliyun", "tencent", "qcloud", "huawei cloud", "huawei",
        "amazon", "aws", "amazon technologies", "google", "gcp", "microsoft", "azure",
        "cloudflare", "akamai", "fastly", "vercel", "netlify",
        "ovh", "hetzner", "contabo", "linode", "digitalocean", "vultr", "leaseweb", "bandwagon",
        "choopa", "colo", "colocation", "datacenter", "data center", "dc", "cdn",
        "ucloud", "upcloud", "scaleway",
    ]

    for kw in black_keywords:
        if kw in text:
            logger.warning(f"IP {ip_info.get('query')} matched black keyword '{kw}' in text: '{text}'")
            return False

    return True

# --- IP Risk Analysis ---

def fetch_ip_risk(ip: str, proxy: Optional[Dict] = None, timeout: int = 5) -> Optional[Dict]:
    """Fetches risk score from scamalytics.com."""
    logger.info(f'Fetching IP risk for: {ip}')
    try:
        response = requests.get(f"https://scamalytics.com/ip/{ip}", proxies=proxy, timeout=timeout)
        response.raise_for_status()
        return _parse_scamalytics_risk(response.text)
    except requests.RequestException as error:
        logger.error(f'Error fetching IP risk for {ip}: {error}')
        return None

def _parse_scamalytics_risk(html_content: str) -> Optional[Dict[str, str]]:
    """Parses the HTML response from scamalytics.com."""
    score_match = re.search(r'"score":"(.*?)"|', html_content)
    risk_match = re.search(r'"risk":"(.*?)"|', html_content)

    if risk_match:
        risk_data = {
            'score': score_match.group(1) if score_match else None,
            'risk': risk_match.group(1)
        }
        return risk_data
    return None

# --- IP Type and other info from Ping0.cc ---

def fetch_ping0_risk(ip: str, proxy: Optional[Dict] = None, timeout: int = 5) -> Optional[Dict]:
    """Fetches additional risk and type info from ping0.cc."""
    logger.info(f'Fetching Ping0 risk for: {ip}')
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/83.0.4103.116 Safari/537.36"
    }
    try:
        initial_response = requests.get(f'https://ping0.cc/ip/{ip}', headers=headers, proxies=proxy, timeout=timeout)
        initial_response.raise_for_status()
        window_x = _parse_window_x(initial_response.text)
        if window_x:
            cookies = {"jskey": window_x}
            final_response = requests.get(f'https://ping0.cc/ip/{ip}', headers=headers, cookies=cookies, proxies=proxy, timeout=timeout)
            final_response.raise_for_status()
            return _parse_ping0_risk(final_response.text)
        else:
            logger.warning(f'Failed to retrieve window.x value for {ip}.')
            return None
    except requests.RequestException as e:
        logger.error(f'Error fetching Ping0 risk for {ip}: {e}')
        return None

def _parse_window_x(html_content: str) -> Optional[str]:
    """Parses the window.x value from ping0.cc HTML to get the jskey cookie."""
    match = re.search(r"window\.x\d*\s*=\s*'([^']+)'", html_content)
    window_x1 = match.group(1) if match else None
    if not window_x1:
        return None
    
    hash_value = 0
    for i in range(0, 32, 4):
        hex_value = int(window_x1[i:i+4], 16)
        hash_value += hex_value + 8
    return str(hash_value)

def _parse_ping0_risk(html_content: str) -> Dict[str, Any]:
    """Parses the final HTML from ping0.cc."""
    tree = html.fromstring(html_content)
    xpath = {
        "ping0Risk": '//div[@class="line line-risk"]//div[@class="riskitem riskcurrent"]/span[@class="value"]',
        "ipType": '/html/body/div[2]/div[2]/div[1]/div[2]/div[8]/div[2]/span',
        "nativeIP": '/html/body/div[2]/div[2]/div[1]/div[2]/div[10]/div[2]/span'
    }
    ping0_data = {}
    for key, path in xpath.items():
        elements = tree.xpath(path)
        ping0_data[key] = elements[0].text_content().strip() if elements else None
    return ping0_data

# --- Utility Functions ---

def is_valid_ipv6(ip: str) -> bool:
    try:
        ipaddress.IPv6Address(ip)
        return True
    except ipaddress.AddressValueError:
        return False

def fetch_ipv4(proxy: dict, timeout: int = 5) -> Optional[str]:
    try:
        response = requests.get('https://api.ipify.org?format=json', proxies=proxy, timeout=timeout)
        return response.json().get('ip')
    except requests.RequestException as e:
        logger.error(f"Failed to fetch IPv4: {e}")
        return None

def fetch_ipv6(proxy: dict, timeout: int = 5) -> Optional[str]:
    try:
        response = requests.get('https://api64.ipify.org?format=json', proxies=proxy, timeout=timeout)
        ipv6 = response.json().get('ip')
        return ipv6 if is_valid_ipv6(ipv6) else None
    except requests.RequestException as e:
        logger.warning(f"Failed to fetch IPv6: {e}")
        return None
