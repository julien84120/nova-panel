from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parent.parent


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(BACKEND_DIR / ".env", BACKEND_DIR.parent / ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    nova_bind_host: str = "127.0.0.1"
    nova_bind_port: int = 8000
    nova_poll_interval: int = 10
    nova_demo: bool = False
    # Dossier du frontend compilé (servi par l'API en production)
    nova_static_dir: Path = BACKEND_DIR.parent / "frontend" / "dist"

    proxmox_host: str = ""
    proxmox_port: int = 8006
    proxmox_user: str = ""
    proxmox_token_name: str = ""
    proxmox_token_secret: str = ""
    proxmox_verify_ssl: bool = False

    docker_ssh_host: str = ""
    docker_display_name: str = "docker-host"

    @property
    def proxmox_enabled(self) -> bool:
        return not self.nova_demo and all(
            [self.proxmox_host, self.proxmox_user, self.proxmox_token_name, self.proxmox_token_secret]
        )

    @property
    def docker_enabled(self) -> bool:
        return not self.nova_demo and bool(self.docker_ssh_host)


@lru_cache
def get_settings() -> Settings:
    return Settings()
