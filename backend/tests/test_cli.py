import io
import sys

from app.cli import main


def test_create_admin_and_reset(monkeypatch, capsys):
    monkeypatch.setattr(sys, "stdin", io.StringIO("a-long-password-1\n"))
    assert main(["create-admin", "--username", "cliuser", "--password-stdin"]) == 0
    monkeypatch.setattr(sys, "stdin", io.StringIO("a-long-password-2\n"))
    assert main(["reset-password", "cliuser", "--password-stdin"]) == 0
    assert main(["list-users"]) == 0
    assert "cliuser" in capsys.readouterr().out
    monkeypatch.setattr(sys, "stdin", io.StringIO("short\n"))
    assert main(["create-admin", "--username", "other", "--password-stdin"]) == 1
