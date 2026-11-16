import logging
from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.models.product import Product
from app.models.price_history import PriceHistory
from app.models.user import User
from app.services.scraper import scrape_product
from app.services.url_validator import is_valid_url, resolve_final_url
from app.services import email_service

logger = logging.getLogger("tracker")

MAX_SCRAPE_FAILURES_BEFORE_DEACTIVATE = 10


async def track_single_product(db: Session, product: Product) -> None:
    """
    Runs the full workflow for one product:
    fetch -> extract -> update product -> insert history ->
    smart alert logic -> send email if needed.

    Never raises — all errors are caught and stored on the product
    so one broken product never stops the scheduler from processing others.
    """
    if not product.tracking_enabled or not product.is_active:
        return

    owner = db.query(User).filter(User.id == product.user_id).first()
    if owner is None:
        return

    was_available = product.is_available
    result = await scrape_product(product.url)

    if not result.success:
        # --- Edge case: scrape failed (HTML changed, CAPTCHA, network, etc.) ---
        product.scrape_error = result.error
        product.scrape_fail_count = (product.scrape_fail_count or 0) + 1
        product.last_scraped_at = datetime.now(timezone.utc)

        # Notify only on the first failure to avoid spamming on every retry
        if product.scrape_fail_count == 1:
            email_service.send_scrape_broken_alert(
                owner.email, product.title, product.url, result.error
            )

        # If a product fails repeatedly over many cycles, it's likely the
        # page was removed — deactivate rather than retry forever.
        if product.scrape_fail_count >= MAX_SCRAPE_FAILURES_BEFORE_DEACTIVATE:
            product.is_active = False
            logger.info(f"Product {product.id} deactivated after repeated scrape failures")

        db.add(product)
        db.commit()
        return

    # --- Successful scrape: reset failure tracking ---
    product.scrape_error = None
    product.scrape_fail_count = 0
    product.last_scraped_at = datetime.now(timezone.utc)

    # Edge case: product name changed -> update automatically
    if result.title:
        product.title = result.title
    if result.image:
        product.image = result.image
    if result.currency:
        product.currency = result.currency

    new_price = result.price
    new_availability = result.is_available

    # Shift current -> previous before overwriting
    if product.current_price is not None:
        product.previous_price = product.current_price
    product.current_price = new_price

    # Track lowest/highest ever
    if product.lowest_price is None or new_price < product.lowest_price:
        product.lowest_price = new_price
    if product.highest_price is None or new_price > product.highest_price:
        product.highest_price = new_price

    product.is_available = new_availability

    # --- Edge case: stock status changes ---
    if was_available and not new_availability:
        email_service.send_out_of_stock_alert(owner.email, product.title, product.url)
    elif not was_available and new_availability:
        email_service.send_back_in_stock_alert(owner.email, product.title, product.url)

    db.add(product)
    db.commit()

    # Insert price history row for every successful scrape
    history_row = PriceHistory(
        product_id=product.id,
        price=new_price,
        availability=new_availability,
    )
    db.add(history_row)
    db.commit()

    # --- Smart Alert Logic ---
    # Send alert only if:
    #   current_price <= target_price  AND  current_price < last_alerted_price
    # (or no alert has ever been sent yet)
    if new_availability and new_price <= product.target_price:
        should_alert = (
            product.last_alerted_price is None or new_price < product.last_alerted_price
        )
        if should_alert:
            sent = email_service.send_price_drop_alert(
                owner.email,
                product.title,
                new_price,
                product.target_price,
                product.currency,
                product.url,
            )
            if sent:
                product.last_alerted_price = new_price
                product.last_alerted_at = datetime.now(timezone.utc)
                db.add(product)
                db.commit()


async def track_all_products(db: Session) -> dict:
    """
    Entry point for the scheduler (and the manual /admin/run-now endpoint).
    Iterates every active, tracking-enabled product. One product's failure
    never stops the rest from being processed.
    """
    products = (
        db.query(Product)
        .filter(Product.tracking_enabled.is_(True), Product.is_active.is_(True))
        .all()
    )

    success_count = 0
    failure_count = 0

    for product in products:
        try:
            await track_single_product(db, product)
            db.refresh(product)
            if product.scrape_error:
                failure_count += 1
            else:
                success_count += 1
        except Exception as exc:  # noqa: BLE001 - scheduler must survive any single failure
            logger.error(f"Unexpected error tracking product {product.id}: {exc}")
            failure_count += 1
            db.rollback()

    return {
        "total_products": len(products),
        "succeeded": success_count,
        "failed": failure_count,
    }


def validate_and_prepare_url(raw_url: str) -> str:
    """
    Validates a URL and resolves redirects before it's stored.
    Raises ValueError with a user-facing message if invalid.
    """
    if not is_valid_url(raw_url):
        raise ValueError("Invalid URL provided")
    return resolve_final_url(raw_url)
