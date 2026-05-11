from sqlalchemy import Column, Integer, String, DateTime, ForeignKey
from sqlalchemy.ext.declarative import declarative_base
Base = declarative_base()


class Domain(Base):
    __tablename__ = 'domains'
    id = Column(Integer, primary_key=True)
    domain = Column(String, unique=True)
    date_creation = Column(DateTime)
