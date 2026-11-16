from datetime import datetime, timedelta, timezone
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.core.deps import get_current_user
from app.models.user import User
from app.models.product import Product
from app.models.price_history import PriceHistory
from app.schemas.price_history import PriceHistoryOut, PriceHistoryStats, PriceHistoryResponse

router = APIRouter(prefix="/products", tags=["Price History"])

PERIOD_DAYS = {"daily": 1, "weekly": 7, "monthly": 30}


@router.get("/{product_id}/history", response_model=PriceHistoryResponse)
def get_price_history(
    product_id: int,
    period: Literal["daily", "weekly", "monthly", "all"] = Query("all"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    product = (
        db.query(Product)
        .filter(Product.id == product_id, Product.user_id == current_user.id)
        .first()
    )
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")

    query = db.query(PriceHistory).filter(PriceHistory.product_id == product_id)

    if period != "all":
        cutoff = datetime.now(timezone.utc) - timedelta(days=PERIOD_DAYS[period])
        query = query.filter(PriceHistory.scraped_at >= cutoff)

    rows = query.order_by(PriceHistory.scraped_at.asc()).all()

    if not rows:
        stats = PriceHistoryStats(lowest_price=0, highest_price=0, average_price=0, data_points=0)
    else:
        prices = [r.price for r in rows]
        stats = PriceHistoryStats(
            lowest_price=min(prices),
            highest_price=max(prices),
            average_price=round(sum(prices) / len(prices), 2),
            data_points=len(prices),
        )

    return PriceHistoryResponse(
        history=[PriceHistoryOut.model_validate(r) for r in rows], stats=stats
    )
