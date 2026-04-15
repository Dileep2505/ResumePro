from fastapi import FastAPI
from fastapi.responses import FileResponse
from fastapi import Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi import UploadFile, File
from fastapi.staticfiles import StaticFiles
from pathlib import Path

# ✅ Import routers (ONLY ONCE, CLEAN)
from backend.api.resume_api import router as resume_router
from backend.api.job_api import router as job_router
from backend.api.optimizer_api import router as optimizer_router
from backend.api.ai_api import router as ai_router
from backend.api.career_api import router as career_router
from backend.api.user_api import router as user_router
from backend.database.db import Base, engine
from backend.database import models  # noqa: F401

# ✅ CREATE APP
app = FastAPI()

WEBAPP_DIR = Path(__file__).resolve().parent.parent / "frontend" / "webapp"

# ✅ ENABLE CORS (for frontend connection)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://resumepro2.me",
        "https://www.resumepro2.me",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:8000",
        "http://127.0.0.1:8000",
        "http://localhost:8001",
        "http://127.0.0.1:8001",
        "http://localhost:5500",
        "http://127.0.0.1:5500",
        "http://localhost:5501",
        "http://127.0.0.1:5501",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ✅ REGISTER ROUTES
app.include_router(resume_router, prefix="/resume")
app.include_router(job_router, prefix="/jobs")
app.include_router(optimizer_router, prefix="/optimizer")
app.include_router(ai_router, prefix="/ai")
app.include_router(career_router, prefix="/career")
app.include_router(user_router, prefix="/users")


@app.on_event("startup")
def startup_create_tables():
    Base.metadata.create_all(bind=engine)

# ✅ ROOT CHECK
@app.get("/")
def home():
    index_file = WEBAPP_DIR / "index.html"
    if index_file.exists():
        return FileResponse(str(index_file))
    return {"status": "Backend running"}

# ✅ OPTIONAL favicon fix (prevents 404 spam)
@app.get("/favicon.ico")
def favicon():
    favicon_file = WEBAPP_DIR / "favicon.ico"
    if favicon_file.exists():
        return FileResponse(str(favicon_file))
    return Response(status_code=204)

if WEBAPP_DIR.exists():
    # Mount static assets so /script.js and /style.css are served for index.html.
    app.mount("/", StaticFiles(directory=str(WEBAPP_DIR)), name="webapp")