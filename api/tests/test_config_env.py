"""Settings actually come from .env, and relative paths do not depend on the shell's cwd.

Both of these were real bugs: `python-dotenv` was in requirements but never called (so a key
in .env was silently ignored), and `DATASET_PATH=./vendor/...` resolved against whatever
directory uvicorn was started from (the README starts it in `api/`, where that path is wrong).
"""
import os
import subprocess
import sys
import textwrap

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))

def test_env_file_is_loaded_and_paths_are_absolute(tmp_path):
    import pathlib
    import shutil

    repo = tmp_path / "repo"
    (repo / "vendor").mkdir(parents=True)
    shutil.copy2(os.path.join(ROOT, "vendor", "cit_public.json"), repo / "vendor" / "cit_public.json")
    shutil.copytree(os.path.join(ROOT, "api", "app"), repo / "api" / "app")

    (repo / ".env").write_text(textwrap.dedent("""\
        DATASET_PATH=./vendor/cit_public.json
        EXPORTS_DIR=./exports
        DATABASE_URL=sqlite:///./tessera.db
        LLM_PROVIDER=groq
        GROQ_API_KEY=gsk_from_the_env_file_1234567890
        """), encoding="utf-8")

    probe = repo / "probe.py"
    probe.write_text(textwrap.dedent("""\
        import sys
        from app.config import get_settings, ENV_FILES_LOADED
        s = get_settings()
        print("loaded", bool(ENV_FILES_LOADED))
        print("provider", s.llm_provider)
        print("key", bool(s.groq_api_key))
        print("dataset", s.dataset_path)
        print("exists", s.dataset_path.exists())
        print("db", s.database_url)
        """), encoding="utf-8")

    # other test modules set these for their own app; the child must see only .env
    CLEAR = ("DATASET_PATH", "EXPORTS_DIR", "DATA_DIR", "DATABASE_URL", "LLM_PROVIDER",
             "GROQ_API_KEY", "LOAD_COMMITTED_EXPORTS", "JWT_SECRET")
    base_env = {k: v for k, v in os.environ.items() if k not in CLEAR}

    def run() -> dict[str, str]:
        out = subprocess.run([sys.executable, str(probe)], cwd=repo / "api",
                             capture_output=True, text=True,
                             env={**base_env, "PYTHONPATH": str(repo / "api")})
        assert out.returncode == 0, out.stdout + out.stderr
        return dict(line.split(" ", 1) for line in out.stdout.strip().splitlines())

    # started from api/, the way the README starts uvicorn
    lines = run()
    assert lines["loaded"] == "True", lines
    assert lines["provider"] == "groq", lines
    assert lines["key"] == "True", lines
    assert lines["exists"] == "True", lines        # ./vendor resolves against the repo root
    assert lines["dataset"].startswith(str(repo)), lines
    assert str(repo / "tessera.db") in lines["db"], lines

    # a real environment variable beats the file - that is how hosting injects secrets
    out = subprocess.run([sys.executable, str(probe)], cwd=repo / "api", capture_output=True,
                         text=True, env={**base_env, "PYTHONPATH": str(repo / "api"),
                                         "LLM_PROVIDER": "none"})
    assert dict(l.split(" ", 1) for l in out.stdout.strip().splitlines())["provider"] == "none"

    # quotes and spaces around a pasted key are tolerated
    (repo / ".env").write_text(
        "GROQ_API_KEY=\"  gsk_pasted_with_quotes_1234567890  \"\nLLM_PROVIDER=groq\n",
        encoding="utf-8")
    assert run()["key"] == "True"
