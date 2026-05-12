from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey, Text
from sqlalchemy.sql import func
from backend.database import Base

class Domain(Base):
    __tablename__ = "domains"
    id = Column(Integer, primary_key=True, index=True)
    domain = Column(String(255), nullable=False)
    date_creation = Column(DateTime, default=func.now())

class Scan(Base):
    __tablename__ = "scans"
    id = Column(Integer, primary_key=True, index=True)
    domain_id = Column(Integer, ForeignKey("domains.id"))
    date_scan = Column(DateTime, default=func.now())

class ResultDns(Base):
    __tablename__ = "results_dns"
    id = Column(Integer, primary_key=True, index=True)
    scan_id = Column(Integer, ForeignKey("scans.id"))
    record_type = Column(String(50))
    value = Column(Text)

class ResultSsl(Base):
    __tablename__ = "results_ssl"
    id = Column(Integer, primary_key=True, index=True)
    scan_id = Column(Integer, ForeignKey("scans.id"))
    valid = Column(Boolean)
    expiry_date = Column(DateTime)
    cert_type = Column(String(100))
    tls_version = Column(String(50))

class ResultHttp(Base):
    __tablename__ = "results_http"
    id = Column(Integer, primary_key=True, index=True)
    scan_id = Column(Integer, ForeignKey("scans.id"))
    hsts = Column(Boolean)
    csp = Column(Boolean)
    x_frame = Column(Boolean)
    x_content_type = Column(Boolean)

class ResultPort(Base):
    __tablename__ = "results_ports"
    id = Column(Integer, primary_key=True, index=True)
    scan_id = Column(Integer, ForeignKey("scans.id"))
    port = Column(Integer)
    service = Column(String(100))
    state = Column(String(50))

class Issue(Base):
    __tablename__ = "issues_detected"
    id = Column(Integer, primary_key=True, index=True)
    scan_id = Column(Integer, ForeignKey("scans.id"))
    severity = Column(String(50))
    description = Column(Text)