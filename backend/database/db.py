import os
from pathlib import Path

from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker

# Prefer DATABASE_URL in cloud deployments; fallback to local SQLite for development.
database_url = os.getenv("DATABASE_URL", "").strip()
if database_url:
	if database_url.startswith("postgres://"):
		database_url = database_url.replace("postgres://", "postgresql://", 1)
	connect_args = {}
else:
	db_path = Path(__file__).resolve().parents[2] / "support" / "database.db"
	database_url = f"sqlite:///{db_path.as_posix()}"
	# check_same_thread=False is required for SQLite when used across FastAPI requests.
	connect_args = {"check_same_thread": False}

engine = create_engine(database_url, connect_args=connect_args)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def get_db():
	db = SessionLocal()
	try:
		yield db
	finally:
		db.close()