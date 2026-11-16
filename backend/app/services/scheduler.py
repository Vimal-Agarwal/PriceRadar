import logging

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.interval import IntervalTrigger

from app.db.database import SessionLocal
from app.services.tracker import track_all_products

logger = logging.getLogger("scheduler")

scheduler = AsyncIOScheduler()


async def scheduled_tracking_job():
    """
    Wrapper that opens its own DB session (separate from request-scoped
    sessions) and guarantees the session is closed and errors are
    logged rather than crashing the whole scheduler process.
    """
    db = SessionLocal()
    try:
        result = await track_all_products(db)
        logger.info(f"Scheduled tracking cycle completed: {result}")
    except Exception as exc:  # noqa: BLE001 - one bad cycle should never kill the scheduler
        logger.error(f"Scheduled tracking cycle failed entirely: {exc}")
    finally:
        db.close()


def start_scheduler():
    scheduler.add_job(
        scheduled_tracking_job,
        trigger=IntervalTrigger(hours=1),
        id="hourly_price_tracking",
        replace_existing=True,
        max_instances=1,  # prevents overlapping runs if one cycle takes long
    )
    scheduler.start()
    logger.info("Scheduler started — tracking will run every hour")


def shutdown_scheduler():
    scheduler.shutdown(wait=False)
