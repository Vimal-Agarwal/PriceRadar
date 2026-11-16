from datetime import datetime
from typing import Optional

from pydantic import BaseModel, HttpUrl, Field


class ProductCreate(BaseModel):
    url: str = Field(min_length=5, max_length=2048)
    nickname: Optional[str] = None
    target_price: float = Field(gt=0)


class ProductUpdate(BaseModel):
    nickname: Optional[str] = None
    target_price: Optional[float] = Field(default=None, gt=0)
    tracking_enabled: Optional[bool] = None


class ProductOut(BaseModel):
    id: int
    url: str
    nickname: Optional[str]
    title: Optional[str]
    image: Optional[str]
    currency: str
    current_price: Optional[float]
    previous_price: Optional[float]
    price_difference: Optional[float] = None
    lowest_price: Optional[float]
    highest_price: Optional[float]
    target_price: float
    is_available: bool
    tracking_enabled: bool
    is_active: bool
    last_scraped_at: Optional[datetime]
    scrape_error: Optional[str]
    created_at: datetime

    class Config:
        from_attributes = True

    @classmethod
    def from_orm_with_diff(cls, product):
        """Builds ProductOut and computes price_difference on the fly."""
        data = cls.model_validate(product)
        if product.current_price is not None and product.previous_price is not None:
            data.price_difference = round(product.current_price - product.previous_price, 2)
        return data
