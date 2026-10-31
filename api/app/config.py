"""Settings, all from the environment. Nothing secret is ever committed (.env is ignored)."""
from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]

# `.env` is the only place a key may live. It is loaded here, before any setting is read,
# and a real environment variable always wins over the file (that is how hosting works).
# Without this the app would silently ignore .env - the classic "I added my key and nothing
# happened" bug.
_ENV_FILES = (ROOT / ".env", ROOT / "api" / ".env")


def _load_env_files() -> list[str]:
    loaded: list[str] = []
    try:
        from dotenv import load_dotenv
    except ImportError:                                   # dotenv not installed: parse by hand
        for path in _ENV_FILES:
            if not path.exists():
                continue
            for line in path.read_text(encoding="utf-8").splitlines():
                line = line.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                key, value = line.split("=", 1)
                os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))
            loaded.append(str(path))
        return loaded
    for path in _ENV_FILES:
        if path.exists():
            load_dotenv(path, override=False)             # real env vars win
            loaded.append(str(path))
    return loaded


ENV_FILES_LOADED = _load_env_files()


def _env(name: str, default: str) -> str:
    value = os.environ.get(name)
    return default if value is None or value == "" else value


def _abs_path(value: str) -> Path:
    """Relative paths resolve against the repo root, not the shell's cwd.

    The README says `cd api && uvicorn ...`; without this, `DATASET_PATH=./vendor/...` from
    .env would look for `api/vendor/...` and the app would die on its first request.
    """
    path = Path(value)
    return path if path.is_absolute() else (ROOT / path).resolve()


def _sqlite_url(value: str) -> str:
    prefix = "sqlite:///"
    if value.startswith(prefix):
        rest = value[len(prefix):]
        if rest and rest != ":memory:" and not Path(rest).is_absolute():
            return prefix + str((ROOT / rest).resolve())
    return value


def _env_int(name: str, default: int) -> int:
    try:
        return int(_env(name, str(default)))
    except ValueError:
        return default


def _env_bool(name: str, default: bool = False) -> bool:
    return _env(name, str(default)).strip().lower() in {"1", "true", "yes", "on"}


@dataclass
class Settings:
    team: str = field(default_factory=lambda: _env("TEAM_NAME", "Voltryx"))
    dataset_path: Path = field(default_factory=lambda: _abs_path(_env("DATASET_PATH", str(ROOT / "vendor" / "cit_public.json"))))
    data_dir: Path = field(default_factory=lambda: _abs_path(_env("DATA_DIR", str(ROOT / "data"))))
    exports_dir: Path = field(default_factory=lambda: _abs_path(_env("EXPORTS_DIR", str(ROOT / "exports"))))
    database_url: str = field(default_factory=lambda: _sqlite_url(_env("DATABASE_URL", f"sqlite:///{ROOT / 'tessera.db'}")))
    jwt_secret: str = field(default_factory=lambda: _env("JWT_SECRET", "tessera-dev-secret-please-change-in-production-32b"))
    jwt_ttl_hours: int = field(default_factory=lambda: _env_int("JWT_TTL_HOURS", 12))

    demo_password: str = field(default_factory=lambda: _env("DEMO_PASSWORD", "Tessera@2027"))
    admin_email: str = field(default_factory=lambda: _env("ADMIN_EMAIL", "admin@cit.edu"))
    dean_email: str = field(default_factory=lambda: _env("DEAN_EMAIL", "dean@cit.edu"))
    dept_email: str = field(default_factory=lambda: _env("DEPT_EMAIL", "dept.cse@cit.edu"))
    faculty_email: str = field(default_factory=lambda: _env("FACULTY_EMAIL", "faculty@cit.edu"))
    club_email: str = field(default_factory=lambda: _env("CLUB_EMAIL", "club@cit.edu"))

    solver_time_limit: int = field(default_factory=lambda: _env_int("SOLVER_TIME_LIMIT", 90))
    solver_workers: int = field(default_factory=lambda: _env_int("SOLVER_WORKERS", 2))
    solver_seed: int = field(default_factory=lambda: _env_int("SOLVER_SEED", 20270131))
    repair_time_limit: int = field(default_factory=lambda: _env_int("REPAIR_TIME_LIMIT", 60))
    load_committed_exports: bool = field(default_factory=lambda: _env_bool("LOAD_COMMITTED_EXPORTS", True))
    cors_origins: list[str] = field(default_factory=lambda: [
        o.strip() for o in _env("CORS_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000").split(",") if o.strip()
    ])

    llm_provider: str = field(default_factory=lambda: _env("LLM_PROVIDER", "none").lower())
    groq_api_key: str = field(default_factory=lambda: _env("GROQ_API_KEY", ""))
    groq_model: str = field(default_factory=lambda: _env("GROQ_MODEL", "llama-3.3-70b-versatile"))
    groq_fallback_model: str = field(default_factory=lambda: _env("GROQ_FALLBACK_MODEL", "llama-3.1-8b-instant"))
    groq_base_url: str = field(default_factory=lambda: _env("GROQ_BASE_URL", "https://api.groq.com/openai/v1"))
    llm_timeout: float = field(default_factory=lambda: float(_env("LLM_TIMEOUT_SECONDS", "12")))

    @property
    def llm_enabled(self) -> bool:
        return self.llm_provider == "groq" and bool(self.groq_api_key)


_settings: Settings | None = None


def get_settings() -> Settings:
    global _settings
    if _settings is None:
        _settings = Settings()
    return _settings


def reset_settings_cache() -> None:
    """Used by tests that change the environment."""
    global _settings
    _settings = None
