import httpx
from urllib.parse import urlparse


def is_valid_url(url: str) -> bool:
    try:
        result = urlparse(url)
        return all([result.scheme in ("http", "https"), result.netloc])
    except Exception:
        return False


def resolve_final_url(url: str, timeout: float = 10.0) -> str:
    """
    Follows redirects (e.g. shortened links, tracking params) and
    returns the final destination URL so we store the canonical one.
    """
    try:
        with httpx.Client(follow_redirects=True, timeout=timeout) as client:
            response = client.head(url)
            return str(response.url)
    except httpx.HTTPError:
        # Some sites block HEAD requests — fall back to the original URL
        return url
