"""Settings, all from the environment. Nothing secret is ever committed (.env is ignored)."""
from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def _env(name: str, default: str) -> str:
    value = os.environ.get(name)
    return default if value is None or value == "" else value


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
    dataset_path: Path = field(default_factory=lambda: Path(_env("DATASET_PATH", str(ROOT / "vendor" / "cit_public.json"))))
    exports_dir: Path = field(default_factory=lambda: Path(_env("EXPORTS_DIR", str(ROOT / "exports"))))
    database_url: str = field(default_factory=lambda: _env("DATABASE_URL", f"sqlite:///{ROOT / 'tessera.db'}"))
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
