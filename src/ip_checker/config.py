"""
Configuration management for IP Checker
"""
import json
import os
from typing import Dict, Any

# Assume config.json is in the project root, which is two levels above this file.
# D:/py_work/《py》/ip-checker/src/ip_checker/config.py -> D:/py_work/《py》/ip-checker/
CONFIG_FILE_PATH = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "config.json"))

def _load_config() -> Dict[str, Any]:
    """Load configuration from file"""
    default_config = {
        "external_controller": "http://127.0.0.1:9090",
        "secret": "",
        "select_proxy_group": "GLOBAL",
        "port_start": 42000,
        "max_threads": 20,
        "ip_info": {
            "primary_provider": "ipinfo",
            "fallback_provider": "ip-api",
            "ipinfo": {
                "base_url": "https://ipinfo.io",
                "rate_limit_per_minute": 1000,
                "timeout": 10
            },
            "ip_api": {
                "base_url": "http://ip-api.com",
                "rate_limit_per_minute": 45,
                "timeout": 8
            }
        }
    }
    try:
        with open(CONFIG_FILE_PATH, 'r', encoding='utf-8') as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        print(f"Warning: '{CONFIG_FILE_PATH}' not found or invalid. Using default config. A default file will be created.")
        with open(CONFIG_FILE_PATH, 'w', encoding='utf-8') as f:
            json.dump(default_config, f, indent=2, ensure_ascii=False)
        return default_config

# Global configuration instance
config = _load_config()

def get_ip_info_config() -> Dict[str, Any]:
    """Get IP information service configuration"""
    return config.get("ip_info", {})

def get_primary_provider() -> str:
    """Get primary IP info provider name"""
    return get_ip_info_config().get("primary_provider", "ipinfo")

def get_fallback_provider() -> str:
    """Get fallback IP info provider name"""
    return get_ip_info_config().get("fallback_provider", "ip-api")

def get_provider_config(provider_name: str) -> Dict[str, Any]:
    """Get configuration for specific provider"""
    ip_info_config = get_ip_info_config()
    return ip_info_config.get(provider_name.replace("-", "_"), {})
