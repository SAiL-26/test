from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from starlette.exceptions import HTTPException as StarletteHTTPException

from .config import settings
from .db import Base, engine
from .routes import ai as ai_routes
from .routes import auth as auth_routes
from .routes import patients as patient_routes
from .routes import scans as scan_routes
from .routes import wave_real as wave_routes


STATIC_DIR = Path(__file__).resolve().parent.parent / "static"


def create_app() -> FastAPI:
    app = FastAPI(title=settings.app_name)

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    Base.metadata.create_all(bind=engine)

    app.include_router(auth_routes.router,    prefix="/api")
    app.include_router(patient_routes.router, prefix="/api")
    app.include_router(scan_routes.router,    prefix="/api")
    app.include_router(wave_routes.router,    prefix="/api")
    app.include_router(ai_routes.router,      prefix="/api")

    @app.get("/health")
    def health():
        return {"status": "ok"}

    # In production, the frontend Vite build is copied into backend/static/.
    # We mount it at / and fall through to index.html for client-side routes.
    if STATIC_DIR.exists() and (STATIC_DIR / "index.html").exists():
        app.mount("/assets", StaticFiles(directory=STATIC_DIR / "assets"), name="assets")

        @app.exception_handler(StarletteHTTPException)
        async def spa_fallback(request, exc):
            # Only fall back for browser-style 404s on GET requests that look like routes
            if exc.status_code == 404 and request.method == "GET":
                accept = request.headers.get("accept", "")
                if "text/html" in accept:
                    return FileResponse(STATIC_DIR / "index.html")
            # default behaviour
            from fastapi.responses import JSONResponse
            return JSONResponse({"detail": exc.detail}, status_code=exc.status_code)

        @app.get("/")
        def root_index():
            return FileResponse(STATIC_DIR / "index.html")

        @app.get("/{path:path}")
        def spa_passthrough(path: str):
            from fastapi.responses import JSONResponse
            # static asset present on disk?
            f = STATIC_DIR / path
            if f.is_file():
                return FileResponse(f)
            # Paths with a file-like extension are NOT client routes — return 404
            # so loaders (GLTFLoader, fetch) don't accidentally parse HTML.
            last = path.rsplit("/", 1)[-1]
            if "." in last and not last.endswith(".html"):
                return JSONResponse({"detail": "not found"}, status_code=404)
            # otherwise SPA index for client-side routes (/login, /patients/2 …)
            return FileResponse(STATIC_DIR / "index.html")

    return app


app = create_app()
