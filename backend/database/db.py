from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker

# check_same_thread=False is required for SQLite when used across FastAPI requests.
engine = create_engine("sqlite:///database.db", connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def get_db():
	db = SessionLocal()
	try:
		yield db
	finally:
		db.close()