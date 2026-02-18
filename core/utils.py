import re
import logging

logger = logging.getLogger(__name__)

def parse_size_to_mb(size_str: str, default: int = 2048) -> int:
    """
    Convertit une chaîne de caractères (ex: '2G', '512M', '1024', '1.5GB') en Mo (Megabytes).
    Supporte les unités G, M, K (ou rien, considéré comme Mo).
    """
    if not size_str:
        return default
        
    size_str = str(size_str).upper().strip()
    # Regex pour capturer le nombre et l'unité optionnelle
    match = re.match(r'^([\d.]+)\s*([GTMK])?B?$', size_str)
    
    if not match:
        # Fallback : on cherche juste des chiffres au début
        digits = re.match(r'^(\d+)', size_str)
        if digits:
            return int(digits.group(1))
        return default

    value, unit = match.groups()
    try:
        value = float(value)
    except ValueError:
        return default
        
    if unit == 'T':
        return int(value * 1024 * 1024)
    if unit == 'G':
        return int(value * 1024)
    if unit == 'K':
        return int(value / 1024)
    # Si 'M' ou pas d'unité (ex: '1024B' -> 'B' matches nothing but value is 1024)
    return int(value)

def parse_size_to_gb(size_str: str, default: float = 2.0) -> float:
    """Idem que parse_size_to_mb mais renvoie des Go"""
    mb = parse_size_to_mb(size_str, int(default * 1024))
    return round(mb / 1024.0, 3)

def format_mb_to_human(mb_value: int) -> str:
    """Formate une valeur en Mo en chaîne lisible (ex: 2048 -> '2.0 GB')"""
    if mb_value >= 1024 * 1024:
        return f"{round(mb_value / (1024 * 1024), 2)} TB"
    if mb_value >= 1024:
        return f"{round(mb_value / 1024, 2)} GB"
    return f"{mb_value} MB"
