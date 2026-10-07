import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from app import __version__
from app.collector import Collector
from app.config import get_settings
from app.schemas import Dashboard, Guest, Host

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    collector = Collector(settings)
    app.state.collector = collector
    await collector.start()
    yield
    await collector.stop()


app = FastAPI(
    title="NovaPanel API",
    version=__version__,
    lifespan=lifespan,
    docs_url="/api/docs",
    openapi_url="/api/openapi.json",
    redoc_url=None,
)


def _snapshot(request: Request) -> Dashboard:
    snap = request.app.state.collector.snapshot
    if snap is None:
        raise HTTPException(503, "collector not ready")
    return snap


@app.get("/api/health")
def health(request: Request):
    snap = request.app.state.collector.snapshot
    return {
        "status": "ok",
        "version": __version__,
        "sources": [s.model_dump() for s in snap.sources] if snap else [],
    }


@app.get("/api/dashboard", response_model=Dashboard)
def dashboard(request: Request):
    return _snapshot(request)


@app.post("/api/dashboard/refresh", response_model=Dashboard)
def refresh(request: Request):
    return request.app.state.collector.refresh()


@app.get("/api/hosts", response_model=list[Host])
def hosts(request: Request):
    return _snapshot(request).hosts


@app.get("/api/guests", response_model=list[Guest])
def guests(request: Request, type: str | None = None, host: str | None = None):
    items = _snapshot(request).guests
    if type:
        items = [g for g in items if g.type == type]
    if host:
        items = [g for g in items if g.host == host]
    return items


# ── Frontend compilé (production) : servi par la même origine que l'API ──
_static = settings.nova_static_dir
if (_static / "index.html").exists():
    app.mount("/assets", StaticFiles(directory=_static / "assets"), name="assets")

    @app.get("/{path:path}", include_in_schema=False)
    def spa(path: str):
        if path.startswith("api/"):
            raise HTTPException(404)
        file = (_static / path).resolve()
        if path and file.is_file() and _static.resolve() in file.parents:
            return FileResponse(file)
        return FileResponse(_static / "index.html")
