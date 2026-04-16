from datetime import datetime
import bcrypt
import logging

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError

from backend.database.db import get_db
from backend.database.models import SearchHistory, User

logger = logging.getLogger(__name__)

router = APIRouter()


class UserRegisterRequest(BaseModel):
    name: str
    email: str
    password: str


class UserLoginRequest(BaseModel):
    email: str
    password: str


class UserUpsertRequest(BaseModel):
    name: str
    email: str
    provider: str = "local"


class SearchCreateRequest(BaseModel):
    email: str
    query_text: str
    search_type: str = "general"
    result_count: int = 0


def _hash_password(password: str) -> str:
    """Hash password using bcrypt with salt"""
    salt = bcrypt.gensalt(rounds=12)
    return bcrypt.hashpw(password.encode("utf-8"), salt).decode("utf-8")


def _verify_password(password: str, password_hash: str) -> bool:
    """Verify password against bcrypt hash"""
    try:
        return bcrypt.checkpw(password.encode("utf-8"), password_hash.encode("utf-8"))
    except Exception as e:
        logger.error(f"Password verification error: {e}")
        return False


@router.post("/register")
def register_user(payload: UserRegisterRequest, db: Session = Depends(get_db)):
    email = payload.email.strip().lower()
    existing = db.query(User).filter(User.email == email).first()
    if existing:
        raise HTTPException(status_code=409, detail="User already exists")

    user = User(
        name=payload.name.strip(),
        email=email,
        password_hash=_hash_password(payload.password),
        provider="local",
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    return {
        "user": {
            "id": user.id,
            "name": user.name,
            "email": user.email,
            "provider": user.provider,
            "created_at": user.created_at.isoformat(),
        }
    }


@router.post("/login")
def login_user(payload: UserLoginRequest, db: Session = Depends(get_db)):
    email = payload.email.strip().lower()
    user = db.query(User).filter(User.email == email).first()

    if not user or not _verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid email or password")

    return {
        "user": {
            "id": user.id,
            "name": user.name,
            "email": user.email,
            "provider": user.provider,
            "created_at": user.created_at.isoformat(),
        }
    }


@router.post("/upsert")
def upsert_user(payload: UserUpsertRequest, db: Session = Depends(get_db)):
    email = payload.email.strip().lower()
    user = db.query(User).filter(User.email == email).first()

    if user:
        user.name = payload.name.strip() or user.name
        user.provider = payload.provider or user.provider
        user.updated_at = datetime.utcnow()
    else:
        user = User(
            name=payload.name.strip(),
            email=email,
            provider=payload.provider or "local",
            password_hash=None,
        )
        db.add(user)

    db.commit()
    db.refresh(user)

    return {
        "user": {
            "id": user.id,
            "name": user.name,
            "email": user.email,
            "provider": user.provider,
            "created_at": user.created_at.isoformat(),
        }
    }


@router.get("/{email}")
def get_user(email: str, db: Session = Depends(get_db)):
    normalized_email = email.strip().lower()
    user = db.query(User).filter(User.email == normalized_email).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    return {
        "user": {
            "id": user.id,
            "name": user.name,
            "email": user.email,
            "provider": user.provider,
            "created_at": user.created_at.isoformat(),
            "updated_at": user.updated_at.isoformat(),
        }
    }


@router.post("/searches")
def create_search(payload: SearchCreateRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == payload.email.strip().lower()).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    if not payload.query_text.strip():
        raise HTTPException(status_code=400, detail="query_text is required")

    entry = SearchHistory(
        user_id=user.id,
        query_text=payload.query_text.strip(),
        search_type=payload.search_type.strip() or "general",
        result_count=max(0, int(payload.result_count)),
    )
    db.add(entry)
    db.commit()
    db.refresh(entry)

    return {
        "search": {
            "id": entry.id,
            "user_id": entry.user_id,
            "query_text": entry.query_text,
            "search_type": entry.search_type,
            "result_count": entry.result_count,
            "created_at": entry.created_at.isoformat(),
        }
    }


@router.get("/{email}/searches")
def get_user_searches(email: str, limit: int = 20, db: Session = Depends(get_db)):
    normalized_email = email.strip().lower()
    user = db.query(User).filter(User.email == normalized_email).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    safe_limit = min(max(limit, 1), 100)
    rows = (
        db.query(SearchHistory)
        .filter(SearchHistory.user_id == user.id)
        .order_by(SearchHistory.created_at.desc())
        .limit(safe_limit)
        .all()
    )

    return {
        "searches": [
            {
                "id": row.id,
                "query_text": row.query_text,
                "search_type": row.search_type,
                "result_count": row.result_count,
                "created_at": row.created_at.isoformat(),
            }
            for row in rows
        ]
    }
