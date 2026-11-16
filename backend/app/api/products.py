from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
import threading

from app.db.database import get_db
from app.core.deps import get_current_user
from app.models.user import User
from app.models.product import Product
from app.schemas.product import ProductCreate, ProductUpdate, ProductOut
from app.services.tracker import validate_and_prepare_url
from app.services.email_service import send_tracking_resumed_alert

router = APIRouter(prefix="/products", tags=["Products"])


def _scrape_product_background(product_id: int):
    """
    Runs immediately after product is added — in a background thread.
    Fetches price, title, image and saves to DB so user sees
    real data within ~5 seconds without pressing Force Scrape.
    """
    from app.db.database import SessionLocal
    from app.services.scraper import scrape_product_sync
    from app.models.price_history import PriceHistory
    from datetime import datetime, timezone

    bg_db = SessionLocal()
    try:
        product = bg_db.query(Product).filter(Product.id == product_id).first()
        if not product:
            print(f"[Auto-Scrape] Product {product_id} not found in DB")
            return

        print(f"[Auto-Scrape] Starting → product_id={product_id} url={product.url}")
        result = scrape_product_sync(product.url)
        print(f"[Auto-Scrape] Result → success={result.success} price={result.price} error={result.error}")

        product.last_scraped_at = datetime.now(timezone.utc)

        if not result.success:
            # Save the error so dashboard shows "Scrape Error" badge
            product.scrape_error = result.error
            bg_db.add(product)
            bg_db.commit()
            print(f"[Auto-Scrape] Failed → error saved to DB")
            return

        # ── Update all product fields ──────────────────────────────────────
        product.scrape_error = None
        if result.title:
            product.title = result.title
        if result.image:
            product.image = result.image
        if result.currency:
            product.currency = result.currency

        new_price = result.price

        # Shift current → previous
        if product.current_price is not None:
            product.previous_price = product.current_price
        product.current_price = new_price
        product.is_available = result.is_available

        # Track lowest / highest ever
        if product.lowest_price is None or new_price < product.lowest_price:
            product.lowest_price = new_price
        if product.highest_price is None or new_price > product.highest_price:
            product.highest_price = new_price

        bg_db.add(product)
        bg_db.commit()

        # ── Insert first price history row ────────────────────────────────
        history = PriceHistory(
            product_id=product.id,
            price=new_price,
            availability=result.is_available,
        )
        bg_db.add(history)
        bg_db.commit()

        print(f"[Auto-Scrape] Done → price={new_price} title={result.title}")

    except Exception as e:
        print(f"[Auto-Scrape] Exception → {e}")
        bg_db.rollback()
    finally:
        bg_db.close()


@router.get("", response_model=list[ProductOut])
def list_products(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    products = db.query(Product).filter(Product.user_id == current_user.id).all()
    return [ProductOut.from_orm_with_diff(p) for p in products]


@router.post("", response_model=ProductOut, status_code=status.HTTP_201_CREATED)
def add_product(
    payload: ProductCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        final_url = validate_and_prepare_url(payload.url)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    # Duplicate URL check
    existing = (
        db.query(Product)
        .filter(Product.user_id == current_user.id, Product.url == final_url)
        .first()
    )
    if existing:
        raise HTTPException(status_code=400, detail="You're already tracking this product")

    product = Product(
        user_id=current_user.id,
        url=final_url,
        nickname=payload.nickname,
        target_price=payload.target_price,
    )
    db.add(product)
    db.commit()
    db.refresh(product)

    # Auto-scrape in background — API returns 201 instantly
    thread = threading.Thread(
        target=_scrape_product_background,
        args=(product.id,),
        daemon=True,
    )
    thread.start()

    return ProductOut.from_orm_with_diff(product)


@router.get("/{product_id}", response_model=ProductOut)
def get_product(
    product_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    product = _get_owned_product(db, product_id, current_user.id)
    return ProductOut.from_orm_with_diff(product)


@router.put("/{product_id}", response_model=ProductOut)
def update_product(
    product_id: int,
    payload: ProductUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    product = _get_owned_product(db, product_id, current_user.id)
    was_paused = not product.tracking_enabled

    if payload.nickname is not None:
        product.nickname = payload.nickname
    if payload.target_price is not None:
        product.target_price = payload.target_price
    if payload.tracking_enabled is not None:
        product.tracking_enabled = payload.tracking_enabled

    db.add(product)
    db.commit()
    db.refresh(product)

    if was_paused and product.tracking_enabled:
        send_tracking_resumed_alert(current_user.email, product.title, product.url)

    return ProductOut.from_orm_with_diff(product)


@router.delete("/{product_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_product(
    product_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    product = _get_owned_product(db, product_id, current_user.id)
    db.delete(product)
    db.commit()
    return None


def _get_owned_product(db: Session, product_id: int, user_id: int) -> Product:
    product = (
        db.query(Product)
        .filter(Product.id == product_id, Product.user_id == user_id)
        .first()
    )
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    return product