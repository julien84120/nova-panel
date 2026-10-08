import logging
from contextlib import asynccontextmanager
from typing import Annotated

from fastapi import Depends, FastAPI, HTTPException, Request, Response
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from app import __version__
from app.alerts import AlertService
from app.audit import AuditLog
from app.auth import COOKIE_NAME, CSRF_HEADER, MIN_PASSWORD_LENGTH, AuthError, AuthService, User
from app.collector import Collector
from app.config import get_settings
from app.db import Database
from app.metrics import MetricsStore
from app.routes.alerts import router as alerts_router
from app.routes.infra import router as infra_router
from app.routes.users import router as users_router
from app.schemas import Dashboard, Guest, Host

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
log = logging.getLogger("novapanel")
settings = get_settings()

# Routes accessibles sans session
PUBLIC_API = {"/api/health", "/api/auth/status", "/api/auth/login", "/api/auth/setup"}
SAFE_METHODS = {"GET", "HEAD", "OPTIONS"}


def _print_setup_banner(auth: AuthService) -> None:
    token = auth.setup_token()
    bar = "═" * 64
    log.warning(
        "\n%s\n  Aucun compte administrateur.\n"
        "  Ouvrez NovaPanel dans le navigateur et saisissez ce jeton d'installation :\n\n"
        "      %s\n\n"
        "  (ou créez le compte en ligne de commande : novapanel create-admin)\n%s",
        bar,
        token,
        bar,
    )


@asynccontextmanager
async def lifespan(app: FastAPI):
    db = Database(settings.nova_data_dir / "novapanel.db")
    app.state.settings = settings
    app.state.auth = AuthService(db, settings)
    app.state.audit = AuditLog(db)
    if app.state.auth.setup_required():
        _print_setup_banner(app.state.auth)
    app.state.alerts = AlertService(db)
    collector = Collector(settings, MetricsStore(db), app.state.alerts)
    app.state.collector = collector
    await collector.start()
    yield
    await collector.stop()


app = FastAPI(
    title="NovaPanel API",
    version=__version__,
    lifespan=lifespan,
    docs_url="/api/docs" if settings.nova_api_docs else None,
    openapi_url="/api/openapi.json" if settings.nova_api_docs else None,
    redoc_url=None,
)

CSP = (
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; "
    "font-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'"
)


def required_role(method: str, path: str) -> str | None:
    """Contrôle d'accès central, refus par défaut : toute écriture exige au moins « operator »."""
    if path.startswith("/api/auth/"):
        return None  # déconnexion, changement de son propre mot de passe
    if path.startswith(("/api/users", "/api/alerts/config", "/api/alerts/channels")):
        return "admin"
    if method in SAFE_METHODS:
        return "viewer"
    return "operator"


@app.middleware("http")
async def security(request: Request, call_next):
    path = request.url.path
    if path.startswith("/api/"):
        # CSRF : en-tête personnalisé obligatoire pour toute requête modifiant l'état
        if request.method not in SAFE_METHODS and request.headers.get(CSRF_HEADER) != "1":
            return JSONResponse({"detail": "csrf_header_missing"}, status_code=403)
        user = request.app.state.auth.session_user(request.cookies.get(COOKIE_NAME))
        request.state.user = user
        if user is None and path not in PUBLIC_API:
            return JSONResponse({"detail": "not_authenticated"}, status_code=401)
        need = required_role(request.method, path)
        if user is not None and need and not user.has(need):
            return JSONResponse({"detail": "forbidden_role", "required": need}, status_code=403)
    response = await call_next(request)
    h = response.headers
    h.setdefault("X-Content-Type-Options", "nosniff")
    h.setdefault("X-Frame-Options", "DENY")
    h.setdefault("Referrer-Policy", "same-origin")
    h.setdefault("Permissions-Policy", "camera=(), microphone=(), geolocation=()")
    if path.startswith("/api/"):
        h.setdefault("Cache-Control", "no-store")
    elif not path.startswith("/api/docs"):
        h.setdefault("Content-Security-Policy", CSP)
    return response


@app.exception_handler(AuthError)
async def auth_error_handler(_: Request, exc: AuthError):
    headers = {"Retry-After": str(exc.retry_after)} if exc.retry_after else None
    body = {"detail": exc.code}
    if exc.retry_after:
        body["retry_after"] = exc.retry_after
    return JSONResponse(body, status_code=exc.status, headers=headers)


def current_user(request: Request) -> User:
    user = getattr(request.state, "user", None)
    if user is None:
        raise HTTPException(401, "not_authenticated")
    return user


def client_ip(request: Request) -> str:
    return request.client.host if request.client else "unknown"


def _set_session_cookie(request: Request, response: Response, token: str) -> None:
    response.set_cookie(
        COOKIE_NAME,
        token,
        max_age=settings.nova_session_days * 86400,
        httponly=True,
        secure=settings.nova_cookie_secure or request.url.scheme == "https",
        samesite="strict",
        path="/",
    )


# ── Authentification ─────────────────────────────────────────
class Credentials(BaseModel):
    username: str
    password: str


class SetupPayload(Credentials):
    token: str


class PasswordChange(BaseModel):
    current_password: str
    new_password: str


@app.get("/api/auth/status")
def auth_status(request: Request):
    user = getattr(request.state, "user", None)
    return {
        "setup_required": request.app.state.auth.setup_required(),
        "authenticated": user is not None,
        "user": {"username": user.username, "role": user.role} if user else None,
        "min_password_length": MIN_PASSWORD_LENGTH,
    }


@app.post("/api/auth/setup")
def auth_setup(payload: SetupPayload, request: Request, response: Response):
    auth: AuthService = request.app.state.auth
    user = auth.complete_setup(payload.token, payload.username, payload.password, client_ip(request))
    token = auth.create_session(user, client_ip(request), request.headers.get("user-agent", ""))
    _set_session_cookie(request, response, token)
    return {"username": user.username}


@app.post("/api/auth/login")
def auth_login(payload: Credentials, request: Request, response: Response):
    auth: AuthService = request.app.state.auth
    user = auth.authenticate(payload.username.strip(), payload.password, client_ip(request))
    token = auth.create_session(user, client_ip(request), request.headers.get("user-agent", ""))
    _set_session_cookie(request, response, token)
    log.info("Connexion de « %s » depuis %s", user.username, client_ip(request))
    return {"username": user.username}


@app.post("/api/auth/logout")
def auth_logout(request: Request, response: Response):
    request.app.state.auth.revoke(request.cookies.get(COOKIE_NAME))
    response.delete_cookie(COOKIE_NAME, path="/")
    return {"ok": True}


@app.post("/api/auth/password")
def auth_password(
    payload: PasswordChange, request: Request, response: Response, user: Annotated[User, Depends(current_user)]
):
    auth: AuthService = request.app.state.auth
    auth.change_password(user, payload.current_password, payload.new_password, client_ip(request))
    # Toutes les sessions sont révoquées ; on en rouvre une pour l'appareil courant
    token = auth.create_session(user, client_ip(request), request.headers.get("user-agent", ""))
    _set_session_cookie(request, response, token)
    return {"ok": True}


# ── Données ──────────────────────────────────────────────────
def _snapshot(request: Request) -> Dashboard:
    snap = request.app.state.collector.snapshot
    if snap is None:
        raise HTTPException(503, "collector not ready")
    return snap


@app.get("/api/health")
def health(request: Request):
    body: dict = {"status": "ok", "version": __version__}
    snap = request.app.state.collector.snapshot
    if getattr(request.state, "user", None) and snap:
        body["sources"] = [s.model_dump() for s in snap.sources]
    return body


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


app.include_router(infra_router)
app.include_router(alerts_router)
app.include_router(users_router)


@app.api_route("/api/{path:path}", methods=["GET", "POST", "PUT", "PATCH", "DELETE"], include_in_schema=False)
def api_not_found(path: str):
    raise HTTPException(404, "not_found")


# ── Frontend compilé (production) : servi par la même origine que l'API ──
_static = settings.nova_static_dir
if (_static / "index.html").exists():
    app.mount("/assets", StaticFiles(directory=_static / "assets"), name="assets")

    @app.get("/{path:path}", include_in_schema=False)
    def spa(path: str):
        file = (_static / path).resolve()
        if path and file.is_file() and _static.resolve() in file.parents:
            return FileResponse(file)
        return FileResponse(_static / "index.html", headers={"Cache-Control": "no-cache"})
