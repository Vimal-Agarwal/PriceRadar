from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.core.deps import get_current_user
from app.models.user import User
from app.services.tracker import track_all_products

router = APIRouter(prefix="/admin", tags=["Admin"])


@router.post("/run-now")
async def run_now(
    db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):
    """
    Manually triggers one full scrape cycle immediately, instead of
    waiting for the next scheduled hourly run. Useful for testing
    and for letting a user force-refresh their dashboard.
    """
    result = await track_all_products(db)
    return {"message": "Tracking cycle completed", **result}
