from datetime import datetime
from pydantic import BaseModel


class PriceHistoryOut(BaseModel):
    id: int
    price: float
    availability: bool
    scraped_at: datetime

    class Config:
        from_attributes = True


class PriceHistoryStats(BaseModel):
    lowest_price: float
    highest_price: float
    average_price: float
    data_points: int


class PriceHistoryResponse(BaseModel):
    history: list[PriceHistoryOut]
    stats: PriceHistoryStats
