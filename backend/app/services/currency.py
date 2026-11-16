import re

CURRENCY_SYMBOLS = {
    "₹": "₹",
    "Rs.": "₹",
    "INR": "₹",
    "$": "$",
    "USD": "$",
    "€": "€",
    "EUR": "€",
}


def detect_currency(text: str) -> str:
    """
    Scans price text for known currency markers.
    Defaults to ₹ (INR) since this targets Indian e-commerce sites,
    but $ and € are detected automatically if present.
    """
    for symbol, normalized in CURRENCY_SYMBOLS.items():
        if symbol in text:
            return normalized
    return "₹"


def extract_price(text: str) -> float | None:
    """
    Extracts the first numeric price value from a string like
    '₹1,234.50' or '$99.99' or 'Rs. 2,000'.
    """
    if not text:
        return None
    # Remove currency symbols/words, keep digits, commas, dots
    cleaned = re.sub(r"[^\d.,]", "", text)
    cleaned = cleaned.replace(",", "")
    match = re.search(r"\d+(\.\d+)?", cleaned)
    if not match:
        return None
    try:
        return float(match.group())
    except ValueError:
        return None
