from datetime import datetime
import bcrypt
import logging

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from backend.database.mongo import users_collection, searches_collection

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
def register_user(payload: UserRegisterRequest):
    email = payload.email.strip().lower()
    existing = users_collection.find_one({"email": email})
    if existing:
        raise HTTPException(status_code=409, detail="User already exists")
    user_doc = {
        "name": payload.name.strip(),
        "email": email,
        "password_hash": _hash_password(payload.password),
        "provider": "local",
    }
    result = users_collection.insert_one(user_doc)
    user_doc["id"] = str(result.inserted_id)
    return {
        "user": {
            "id": user_doc["id"],
            "name": user_doc["name"],
            "email": user_doc["email"],
            "provider": user_doc["provider"],
            "created_at": "",
        }
    }


@router.post("/login")
def login_user(payload: UserLoginRequest):
    email = payload.email.strip().lower()
    user = users_collection.find_one({"email": email})
    if not user or not _verify_password(payload.password, user.get("password_hash", "")):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    return {
        "user": {
            "id": str(user.get("_id")),
            "name": user.get("name"),
            "email": user.get("email"),
            "provider": user.get("provider"),
            "created_at": "",
        }
    }


@router.post("/upsert")
def upsert_user(payload: UserUpsertRequest):
    email = payload.email.strip().lower()
    user = users_collection.find_one({"email": email})
    if user:
        users_collection.update_one({"email": email}, {"$set": {
            "name": payload.name.strip() or user["name"],
            "provider": payload.provider or user["provider"]
        }})
        user = users_collection.find_one({"email": email})
    else:
        user_doc = {
            "name": payload.name.strip(),
            "email": email,
            "provider": payload.provider or "local",
            "password_hash": None,
        }
        result = users_collection.insert_one(user_doc)
        user_doc["_id"] = result.inserted_id
        user = user_doc
    return {
        "user": {
            "id": str(user.get("_id")),
            "name": user.get("name"),
            "email": user.get("email"),
            "provider": user.get("provider"),
            "created_at": "",
        }
    }


@router.get("/{email}")
def get_user(email: str):
    normalized_email = email.strip().lower()
    user = users_collection.find_one({"email": normalized_email})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return {
        "user": {
            "id": str(user.get("_id")),
            "name": user.get("name"),
            "email": user.get("email"),
            "provider": user.get("provider"),
            "created_at": "",
            "updated_at": "",
        }
    }


@router.post("/searches")
def create_search(payload: SearchCreateRequest):
    email = payload.email.strip().lower()
    user = users_collection.find_one({"email": email})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if not payload.query_text.strip():
        raise HTTPException(status_code=400, detail="query_text is required")
    entry_doc = {
        "user_email": email,
        "query_text": payload.query_text.strip(),
        "search_type": payload.search_type.strip() or "general",
        "result_count": max(0, int(payload.result_count)),
        "created_at": datetime.utcnow(),
    }
    result = searches_collection.insert_one(entry_doc)
    entry_doc["id"] = str(result.inserted_id)
    return {
        "search": {
            "id": entry_doc["id"],
            "user_email": entry_doc["user_email"],
            "query_text": entry_doc["query_text"],
            "search_type": entry_doc["search_type"],
            "result_count": entry_doc["result_count"],
            "created_at": entry_doc["created_at"].isoformat(),
        }
    }


@router.get("/{email}/searches")
def get_user_searches(email: str, limit: int = 20):
    normalized_email = email.strip().lower()
    user = users_collection.find_one({"email": normalized_email})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    safe_limit = min(max(limit, 1), 100)
    rows = list(searches_collection.find({"user_email": normalized_email}).sort("created_at", -1).limit(safe_limit))
    return {
        "searches": [
            {
                "id": str(row.get("_id")),
                "query_text": row.get("query_text"),
                "search_type": row.get("search_type"),
                "result_count": row.get("result_count"),
                "created_at": row.get("created_at").isoformat() if row.get("created_at") else "",
            }
            for row in rows
        ]
    }
