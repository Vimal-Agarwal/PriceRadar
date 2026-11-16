from sqlalchemy import (
    Column, Integer, String, Float, Boolean, DateTime, ForeignKey, Text
)
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship

from app.db.database import Base


class Product(Base):
    __tablename__ = "products"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)

    url = Column(String(2048), nullable=False)
    nickname = Column(String(255), nullable=True)
    title = Column(String(500), nullable=True)
    image = Column(String(2048), nullable=True)

    currency = Column(String(5), default="₹")
    current_price = Column(Float, nullable=True)
    previous_price = Column(Float, nullable=True)
    lowest_price = Column(Float, nullable=True)
    highest_price = Column(Float, nullable=True)
    target_price = Column(Float, nullable=False)

    is_available = Column(Boolean, default=True)
    tracking_enabled = Column(Boolean, default=True)
    is_active = Column(Boolean, default=True)  # False if page was permanently removed

    last_scraped_at = Column(DateTime(timezone=True), nullable=True)
    last_alerted_price = Column(Float, nullable=True)
    last_alerted_at = Column(DateTime(timezone=True), nullable=True)
    scrape_error = Column(Text, nullable=True)
    scrape_fail_count = Column(Integer, default=0)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    owner = relationship("User", back_populates="products")
    price_history = relationship(
        "PriceHistory", back_populates="product", cascade="all, delete-orphan"
    )
