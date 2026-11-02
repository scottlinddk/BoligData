from __future__ import annotations

import hashlib
import tomllib
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def load_config(path: str | Path | None = None) -> dict:
    """Læs config.toml og tilføj sti og hash, så et resultat kan knyttes til præcis denne konfiguration."""
    p = Path(path) if path else ROOT / "config" / "config.toml"
    raw = p.read_bytes()
    cfg = tomllib.loads(raw.decode("utf-8"))
    cfg["_root"] = str(ROOT)
    cfg["_config_sha256"] = hashlib.sha256(raw).hexdigest()
    return cfg


def resolve(cfg: dict, relative: str) -> Path:
    return (Path(cfg["_root"]) / relative).resolve()


def sha256_file(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()
