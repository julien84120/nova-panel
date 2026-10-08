"""Canaux de notification : e-mail (SMTP), Discord, Telegram, ntfy, webhook JSON générique."""

from __future__ import annotations

import logging
import re
import smtplib
import ssl
from email.message import EmailMessage

import requests

log = logging.getLogger("novapanel.notify")

CHANNEL_TYPES = {"email", "discord", "telegram", "ntfy", "webhook"}
# Champs sensibles : jamais renvoyés au navigateur
SECRET_FIELDS = {
    "email": {"password"},
    "discord": {"url"},
    "telegram": {"bot_token"},
    "ntfy": {"token"},
    "webhook": {"url", "secret"},
}
SEVERITY_RANK = {"info": 0, "warning": 1, "critical": 2}
ICONS = {"info": "ℹ️", "warning": "⚠️", "critical": "🔴", "resolved": "✅"}
DISCORD_COLORS = {"info": 0x3B82F6, "warning": 0xF59E0B, "critical": 0xEF4444, "resolved": 0x22C55E}
TIMEOUT = 10


class NotifyError(Exception):
    pass


def send(channel: dict, message: dict) -> None:
    """message : {severity, title, detail, resolved: bool, url}"""
    kind = channel.get("type")
    cfg = channel.get("config") or {}
    state = "resolved" if message.get("resolved") else message["severity"]
    prefix = ICONS[state]
    title = f"{prefix} {message['title']}"
    body = message.get("detail", "")
    try:
        if kind == "email":
            _email(cfg, title, body, message)
        elif kind == "discord":
            r = requests.post(
                cfg["url"],
                json={
                    "username": "NovaPanel",
                    "embeds": [
                        {
                            "title": title[:250],
                            "description": body[:4000],
                            "color": DISCORD_COLORS[state],
                            "url": message.get("url") or None,
                        }
                    ],
                },
                timeout=TIMEOUT,
            )
            r.raise_for_status()
        elif kind == "telegram":
            text = f"*{_md(title)}*\n{_md(body)}"
            r = requests.post(
                f"https://api.telegram.org/bot{cfg['bot_token']}/sendMessage",
                json={
                    "chat_id": cfg["chat_id"],
                    "text": text,
                    "parse_mode": "MarkdownV2",
                    "disable_web_page_preview": True,
                },
                timeout=TIMEOUT,
            )
            if not r.ok:
                raise NotifyError(r.json().get("description", r.text)[:200])
        elif kind == "ntfy":
            server = (cfg.get("server") or "https://ntfy.sh").rstrip("/")
            headers = {
                "Title": title.encode("utf-8"),
                "Priority": {"info": "3", "warning": "4", "critical": "5", "resolved": "2"}[state],
                "Tags": {
                    "info": "information_source",
                    "warning": "warning",
                    "critical": "rotating_light",
                    "resolved": "white_check_mark",
                }[state],
            }
            if cfg.get("token"):
                headers["Authorization"] = f"Bearer {cfg['token']}"
            if message.get("url"):
                headers["Click"] = message["url"]
            r = requests.post(f"{server}/{cfg['topic']}", data=body.encode("utf-8"), headers=headers, timeout=TIMEOUT)
            r.raise_for_status()
        elif kind == "webhook":
            headers = {"Content-Type": "application/json", "User-Agent": "NovaPanel"}
            if cfg.get("secret"):
                headers["Authorization"] = f"Bearer {cfg['secret']}"
            r = requests.post(
                cfg["url"], json={"source": "novapanel", "state": state, **message}, headers=headers, timeout=TIMEOUT
            )
            r.raise_for_status()
        else:
            raise NotifyError(f"unknown channel type {kind}")
    except KeyError as exc:
        raise NotifyError(f"missing setting: {exc.args[0]}") from exc
    except requests.HTTPError as exc:
        # Jamais l'URL dans le message : pour Discord/Telegram/webhook elle contient le secret
        raise NotifyError(f"HTTP {exc.response.status_code if exc.response is not None else '?'}") from None
    except requests.ConnectionError:
        raise NotifyError("connection failed (host unreachable or refused)") from None
    except requests.Timeout:
        raise NotifyError("timeout") from None
    except requests.RequestException as exc:
        raise NotifyError(type(exc).__name__) from None
    except (smtplib.SMTPException, OSError) as exc:
        raise NotifyError(str(exc)[:200]) from exc


def _email(cfg: dict, title: str, body: str, message: dict) -> None:
    msg = EmailMessage()
    msg["Subject"] = f"[NovaPanel] {title}"
    msg["From"] = cfg.get("sender") or cfg.get("username")
    msg["To"] = cfg["to"]
    text = body + (f"\n\n{message['url']}" if message.get("url") else "")
    msg.set_content(text)
    host, port = cfg["host"], int(cfg.get("port") or 587)
    security = cfg.get("security", "starttls")
    ctx = ssl.create_default_context()
    if security == "ssl":
        server = smtplib.SMTP_SSL(host, port, timeout=TIMEOUT, context=ctx)
    else:
        server = smtplib.SMTP(host, port, timeout=TIMEOUT)
    with server:
        if security == "starttls":
            server.starttls(context=ctx)
        if cfg.get("username"):
            server.login(cfg["username"], cfg.get("password", ""))
        server.send_message(msg)


def _md(text: str) -> str:
    """Échappement MarkdownV2 de Telegram."""
    # Un seul passage : chaque caractère réservé (y compris « \ ») est précédé d'un « \ »
    return re.sub(r"([_*\[\]()~`>#+\-=|{}.!\\])", r"\\\1", text)
