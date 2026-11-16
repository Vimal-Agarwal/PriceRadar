import logging
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

from app.core.config import settings

logger = logging.getLogger("email")


def _send_email(to_email: str, subject: str, body_html: str) -> bool:
    """
    Sends an email via SMTP. Returns True/False instead of raising,
    so a failed email never crashes the scheduler.
    """
    if not settings.SMTP_USER or not settings.SMTP_PASSWORD:
        logger.warning("SMTP credentials not configured — skipping email send")
        return False

    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = settings.SMTP_USER
    msg["To"] = to_email
    msg.attach(MIMEText(body_html, "html"))

    try:
        with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT) as server:
            server.starttls()
            server.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
            server.sendmail(settings.SMTP_USER, to_email, msg.as_string())
        return True
    except Exception as exc:  # noqa: BLE001 - never crash scheduler over email
        logger.error(f"Failed to send email to {to_email}: {exc}")
        return False


def send_price_drop_alert(to_email: str, product_title: str, current_price: float,
                            target_price: float, currency: str, product_url: str):
    subject = f"🎉 Price Drop: {product_title or 'Your tracked product'}"
    body = f"""
    <h2>Good news!</h2>
    <p><b>{product_title}</b> has dropped to <b>{currency}{current_price}</b>,
    which is at or below your target of {currency}{target_price}.</p>
    <p><a href="{product_url}">View Product</a></p>
    """
    return _send_email(to_email, subject, body)


def send_back_in_stock_alert(to_email: str, product_title: str, product_url: str):
    subject = f"✅ Back in Stock: {product_title or 'Your tracked product'}"
    body = f"""
    <h2>Your product is available again</h2>
    <p><b>{product_title}</b> is back in stock.</p>
    <p><a href="{product_url}">View Product</a></p>
    """
    return _send_email(to_email, subject, body)


def send_out_of_stock_alert(to_email: str, product_title: str, product_url: str):
    subject = f"⚠️ Out of Stock: {product_title or 'Your tracked product'}"
    body = f"""
    <h2>Product is currently unavailable</h2>
    <p><b>{product_title}</b> just went out of stock. We'll notify you
    as soon as it's back.</p>
    <p><a href="{product_url}">View Product</a></p>
    """
    return _send_email(to_email, subject, body)


def send_scrape_broken_alert(to_email: str, product_title: str, product_url: str, error: str):
    subject = f"🔧 Tracking issue: {product_title or 'Your tracked product'}"
    body = f"""
    <h2>We're having trouble tracking this product</h2>
    <p><b>{product_title or product_url}</b> could not be scraped.</p>
    <p>Reason: {error}</p>
    <p>We'll keep retrying automatically.</p>
    """
    return _send_email(to_email, subject, body)


def send_tracking_resumed_alert(to_email: str, product_title: str, product_url: str):
    subject = f"▶️ Tracking Resumed: {product_title or 'Your tracked product'}"
    body = f"""
    <h2>Tracking resumed</h2>
    <p><b>{product_title}</b> is being tracked again.</p>
    <p><a href="{product_url}">View Product</a></p>
    """
    return _send_email(to_email, subject, body)
