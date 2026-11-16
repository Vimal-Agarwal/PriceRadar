from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base

from app.core.config import settings

# Engine manages the connection pool to PostgreSQL
engine = create_engine(settings.DATABASE_URL, pool_pre_ping=True)

# Each request gets its own session
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# All ORM models inherit from this Base
Base = declarative_base()


def get_db():
    """
    FastAPI dependency — yields a DB session and guarantees
    it closes after the request, even on error.
    """
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()