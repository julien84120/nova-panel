import uvicorn

from app.config import get_settings

if __name__ == "__main__":
    s = get_settings()
    uvicorn.run("app.main:app", host=s.nova_bind_host, port=s.nova_bind_port, proxy_headers=True)
