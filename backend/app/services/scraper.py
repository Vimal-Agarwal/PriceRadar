import asyncio
import logging
import time
import os
import urllib.parse
from dataclasses import dataclass

import httpx
from bs4 import BeautifulSoup

from app.core.config import settings
from app.services.currency import detect_currency, extract_price

logger = logging.getLogger("scraper")

USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/124.0 Safari/537.36"
)

MAX_RETRIES = 3
BASE_BACKOFF_SECONDS = 2

# ScraperAPI's render=true does internal retries + JS rendering + antibot bypass -
# 60s is too short for Amazon specifically. Bumping to 120s with separate connect timeout.
SCRAPE_TIMEOUT = httpx.Timeout(120.0, connect=15.0)


@dataclass
class ScrapeResult:
    success: bool
    title: str | None = None
    price: float | None = None
    currency: str | None = None
    image: str | None = None
    is_available: bool = True
    error: str | None = None
    is_captcha_or_blocked: bool = False


def _extract_from_html(html: str) -> ScrapeResult:
    soup = BeautifulSoup(html, "html.parser")

    title = None
    price = None
    currency = None
    image = None

    # Strategy 1: Open Graph tags
    og_title = soup.find("meta", property="og:title")
    if og_title and og_title.get("content"):
        title = og_title["content"].strip()

    og_image = soup.find("meta", property="og:image")
    if og_image and og_image.get("content"):
        image = og_image["content"].strip()

    og_price = soup.find("meta", property="product:price:amount") or soup.find(
        "meta", property="og:price:amount"
    )
    if og_price and og_price.get("content"):
        price = extract_price(og_price["content"])

    og_currency = soup.find("meta", property="product:price:currency")
    if og_currency and og_currency.get("content"):
        currency = "₹" if og_currency["content"] in ("INR",) else og_currency["content"]

    # Strategy 2: fallback title tag
    if not title and soup.title:
        title = soup.title.get_text(strip=True)

    # Strategy 3: Amazon specific selectors
    if price is None:
        amazon_selectors = [
            "#priceblock_ourprice",
            "#priceblock_dealprice",
            "#priceblock_saleprice",
            ".a-price .a-offscreen",
            "#price_inside_buybox",
            "#newBuyBoxPrice",
            ".apexPriceToPay .a-offscreen",
            "#corePriceDisplay_desktop_feature_div .a-price .a-offscreen",
            "#corePrice_feature_div .a-price .a-offscreen",
            "#apex_desktop .a-price .a-offscreen",
            "#tp_price_block_total_price_ww .a-offscreen",
            "#sns-base-price .a-offscreen",
        ]
        for selector in amazon_selectors:
            el = soup.select_one(selector)
            if el:
                text = el.get_text(strip=True)
                extracted = extract_price(text)
                if extracted and extracted > 0:
                    price = extracted
                    currency = currency or detect_currency(text)
                    print(f"[Scraper] Amazon price found via '{selector}': {price}")
                    break

    # Strategy 3b: Amazon specific image (og:image often missing/blocked on Amazon)
    if image is None:
        img_el = soup.select_one("#landingImage") or soup.select_one("#imgTagWrapperId img") \
            or soup.select_one("#main-image-container img")
        if img_el:
            image = img_el.get("data-old-hires") or img_el.get("src")
            if not image and img_el.get("data-a-dynamic-image"):
                # data-a-dynamic-image is a JSON string: {"url1": [w,h], "url2": [w,h], ...}
                import json as _json
                try:
                    urls = list(_json.loads(img_el["data-a-dynamic-image"]).keys())
                    image = urls[0] if urls else None
                except Exception:
                    pass

    # Strategy 4: heuristic price scan
    if price is None:
        price_candidates = soup.select('[class*="price" i], [id*="price" i]')
        for el in price_candidates:
            text = el.get_text(strip=True)
            extracted = extract_price(text)
            if extracted and extracted > 0:
                price = extracted
                currency = currency or detect_currency(text)
                break

    if currency is None:
        currency = "₹"

    # Availability heuristic
    page_text = soup.get_text(" ", strip=True).lower()
    is_available = not any(
        phrase in page_text
        for phrase in ["out of stock", "currently unavailable", "sold out", "not available"]
    )

    # Detect Amazon's "are you a robot" / CAPTCHA page - explains missing price+image
    is_captcha = any(
        phrase in page_text
        for phrase in [
            "sorry, we just need to make sure you're not a robot",
            "enter the characters you see below",
            "api access to amazon is prohibited",
        ]
    )
    if is_captcha:
        print("[Scraper] ⚠️ Amazon served a CAPTCHA/robot-check page instead of the product page")
        return ScrapeResult(
            success=False,
            title=title,
            image=image,
            error="Amazon blocked the request with a CAPTCHA page (needs premium proxy)",
            is_captcha_or_blocked=True,
        )

    if price is None:
        return ScrapeResult(
            success=False,
            title=title,
            image=image,
            error="Could not locate price on page (site structure may have changed)",
        )

    return ScrapeResult(
        success=True,
        title=title,
        price=price,
        currency=currency,
        image=image,
        is_available=is_available,
    )


def _build_scraperapi_url(url: str) -> str:
    """
    Wraps target URL with ScraperAPI. Amazon needs premium=true (residential
    proxy pool) since basic render alone gets blocked/times out on it -
    costs more credits per request but is what actually gets past Amazon.
    """
    api_key = settings.SCRAPER_API_KEY
    if not api_key:
        return url

    encoded_url = urllib.parse.quote(url, safe="")
    params = f"api_key={api_key}&url={encoded_url}&render=true"

    if "amazon." in url:
        params += "&premium=true&country_code=in"

    return f"http://api.scraperapi.com?{params}"


# ── Async version (used by scheduler) ────────────────────────────────────────
async def scrape_product(url: str) -> ScrapeResult:
    """Async scraper used by the hourly scheduler."""
    headers = {"User-Agent": USER_AGENT, "Accept-Language": "en-US,en;q=0.9"}
    last_error = None

    url = _build_scraperapi_url(url)

    for attempt in range(1, MAX_RETRIES + 1):
        try:
            async with httpx.AsyncClient(
                follow_redirects=True, timeout=SCRAPE_TIMEOUT, headers=headers
            ) as client:
                response = await client.get(url)

            if response.status_code in (403, 429):
                last_error = f"Blocked or rate-limited (HTTP {response.status_code})"
                logger.warning(f"Attempt {attempt}: {last_error}")
                if attempt < MAX_RETRIES:
                    await asyncio.sleep(BASE_BACKOFF_SECONDS * (2 ** (attempt - 1)))
                    continue
                return ScrapeResult(success=False, error=last_error, is_captcha_or_blocked=True)

            if response.status_code >= 400:
                last_error = f"HTTP {response.status_code} when fetching page"
                if attempt < MAX_RETRIES:
                    await asyncio.sleep(BASE_BACKOFF_SECONDS * (2 ** (attempt - 1)))
                    continue
                return ScrapeResult(success=False, error=last_error)

            return _extract_from_html(response.text)

        except httpx.TimeoutException:
            last_error = "Request timed out"
        except httpx.HTTPError as exc:
            last_error = f"Network error: {exc}"
        except Exception as exc:
            last_error = f"Unexpected scraping error: {exc}"

        logger.warning(f"Attempt {attempt}/{MAX_RETRIES} failed: {last_error}")
        if attempt < MAX_RETRIES:
            await asyncio.sleep(BASE_BACKOFF_SECONDS * (2 ** (attempt - 1)))

    return ScrapeResult(success=False, error=last_error or "Unknown scraping failure")


# ── Sync version (used by background threads in products.py) ─────────────────
def scrape_product_sync(url: str) -> ScrapeResult:
    """
    Synchronous scraper for background threads.
    Uses ScraperAPI automatically if SCRAPER_API_KEY is set in .env
    ScraperAPI handles Amazon bot detection + JavaScript rendering.
    """
    api_key = settings.SCRAPER_API_KEY
    is_amazon = "amazon." in url
    if api_key:
        url = _build_scraperapi_url(url)
        print(f"[Scraper] ScraperAPI mode ON ✅ (premium={'yes' if is_amazon else 'no'})")
    else:
        print(f"[Scraper] Direct mode (no ScraperAPI key)")

    headers = {"User-Agent": USER_AGENT, "Accept-Language": "en-US,en;q=0.9"}
    last_error = None

    for attempt in range(1, MAX_RETRIES + 1):
        try:
            print(f"[Scraper] Attempt {attempt}/{MAX_RETRIES} (timeout={SCRAPE_TIMEOUT})...")
            with httpx.Client(
                follow_redirects=True, timeout=SCRAPE_TIMEOUT, headers=headers
            ) as client:
                response = client.get(url)

            print(f"[Scraper] HTTP {response.status_code} on attempt {attempt}")

            if response.status_code in (403, 429):
                last_error = f"Blocked (HTTP {response.status_code})"
                time.sleep(BASE_BACKOFF_SECONDS * (2 ** (attempt - 1)))
                continue

            if response.status_code >= 400:
                last_error = f"HTTP {response.status_code}"
                time.sleep(BASE_BACKOFF_SECONDS * (2 ** (attempt - 1)))
                continue

            result = _extract_from_html(response.text)
            print(f"[Scraper] Extracted → price={result.price} title={result.title}")
            return result

        except httpx.TimeoutException:
            last_error = "Request timed out"
        except httpx.HTTPError as exc:
            last_error = f"Network error: {exc}"
        except Exception as exc:
            last_error = f"Unexpected error: {exc}"

        logger.warning(f"[Sync] Attempt {attempt}/{MAX_RETRIES} failed: {last_error}")
        time.sleep(BASE_BACKOFF_SECONDS * (2 ** (attempt - 1)))

    return ScrapeResult(success=False, error=last_error or "Unknown error")