"""Authentication and role rules.

Hackathon rules enforced in code, not only in the UI:
  * four roles, each with a fixed capability set;
  * nobody may approve their own request (see routers/disruption.py);
  * a role may never exceed its booking category cap (applied in core/dataset.py).
"""
from __future__ import annotations

import hashlib
import hmac
import os
import uuid
from datetime import timedelta
from typing import Iterable

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlmodel import Session, select

from .config import get_settings
from .db import RevokedToken, User, get_session, utcnow

ROLES = ("admin", "department_coordinator", "faculty", "club")
ALGORITHM = "HS256"
_bearer = HTTPBearer(auto_error=False)


# ------------------------------------------------------------------ passwords
def hash_password(password: str, *, salt: bytes | None = None) -> str:
    salt = salt or os.urandom(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, 120_000)
    return f"pbkdf2_sha256${salt.hex()}${digest.hex()}"


def verify_password(password: str, stored: str) -> bool:
    try:
        scheme, salt_hex, digest_hex = stored.split("$")
    except ValueError:
        return False
    if scheme != "pbkdf2_sha256":
        return False
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), bytes.fromhex(salt_hex), 120_000)
    return hmac.compare_digest(digest.hex(), digest_hex)


# ------------------------------------------------------------------ tokens
def create_token(user: User) -> str:
    s = get_settings()
    payload = {
        "sub": str(user.id),
        "jti": uuid.uuid4().hex,
        "email": user.email,
        "role": user.role,
        "name": user.name,
        "exp": utcnow() + timedelta(hours=s.jwt_ttl_hours),
        "iat": utcnow(),
    }
    return jwt.encode(payload, s.jwt_secret, algorithm=ALGORITHM)


def decode_token(token: str) -> dict:
    s = get_settings()
    try:
        return jwt.decode(token, s.jwt_secret, algorithms=[ALGORITHM])
    except jwt.ExpiredSignatureError as exc:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "session expired, please log in again") from exc
    except jwt.PyJWTError as exc:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "invalid session token") from exc


def current_user(
    creds: HTTPAuthorizationCredentials | None = Depends(_bearer),
    session: Session = Depends(get_session),
) -> User:
    if creds is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "missing bearer token")
    payload = decode_token(creds.credentials)
    token_hash = hashlib.sha256(creds.credentials.encode("utf-8")).hexdigest()
    if session.get(RevokedToken, token_hash):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "session has been signed out")
    try:
        user_id = int(payload["sub"])
    except (ValueError, KeyError, TypeError) as exc:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "invalid session token") from exc
    user = session.get(User, user_id)
    if user is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "user no longer exists")
    return user


def require_roles(*roles: str):
    allowed = set(roles)

    def _dep(user: User = Depends(current_user)) -> User:
        if user.role not in allowed:
            raise HTTPException(
                status.HTTP_403_FORBIDDEN,
                f"role '{user.role}' may not do this; allowed: {', '.join(sorted(allowed))}",
            )
        return user

    return _dep


require_admin = require_roles("admin")
require_staff = require_roles("admin", "department_coordinator")


# ------------------------------------------------------------------ capability map
CAPABILITIES = {
    "admin": {
        "generate_timetable", "validate", "approve_change", "approve_booking",
        "load_dataset", "export", "reset_demo", "view_all", "manual_event",
    },
    "department_coordinator": {
        "request_change", "book_department_room", "approve_department_lab",
        "view_own_department", "manual_event",
    },
    "faculty": {"view_own_timetable", "mark_unavailability", "request_change", "use_ai"},
    "club": {"submit_booking_request", "cancel_booking_request", "view_request_status", "use_ai"},
}


def capabilities_for(role: str) -> list[str]:
    return sorted(CAPABILITIES.get(role, set()))


def seed_users(session: Session) -> list[User]:
    """Idempotent demo seed. Passwords come from the environment, never from code."""
    s = get_settings()
    wanted = [
        (s.admin_email, "Dean's office (Admin)", "admin", "", "", ""),
        (s.dean_email, "Dean (second admin, can approve the first admin's proposals)", "admin", "", "", ""),
        (s.dept_email, "CSE department coordinator", "department_coordinator", "CSE", "", "CSE-3"),
        (s.faculty_email, "Faculty (Dr. Ananya Rao)", "faculty", "CSE", _first_faculty_id(s), ""),
        (s.club_email, "Spectra club representative", "club", "", "", ""),
    ]
    created: list[User] = []
    for email, name, role, dept, faculty_id, group_id in wanted:
        user = session.exec(select(User).where(User.email == email)).first()
        if user is None:
            user = User(email=email, name=name, role=role, department=dept,
                        faculty_id=faculty_id, group_id=group_id,
                        password_hash=hash_password(s.demo_password))
            session.add(user)
        else:
            # keep roles/config in sync with the environment without resetting the password
            user.role = role
            user.name = name
            user.department = dept
            user.faculty_id = faculty_id
            user.group_id = group_id
        created.append(user)
    session.commit()
    for user in created:
        session.refresh(user)
    return created


def _first_faculty_id(settings) -> str:
    try:
        import json

        with open(settings.dataset_path, encoding="utf-8") as f:
            data = json.load(f)
        return data["faculty"][0]["id"]
    except Exception:
        return "F01"


def demo_accounts() -> list[dict]:
    """What the README and the login page advertise."""
    s = get_settings()
    return [
        {"role": "admin", "email": s.admin_email, "label": "Admin (Dean's office)"},
        {"role": "admin", "email": s.dean_email, "label": "Admin (second approver)"},
        {"role": "department_coordinator", "email": s.dept_email, "label": "Department coordinator"},
        {"role": "faculty", "email": s.faculty_email, "label": "Faculty"},
        {"role": "club", "email": s.club_email, "label": "Club representative"},
    ]


def emails_for_roles(roles: Iterable[str]) -> list[str]:
    return [a["email"] for a in demo_accounts() if a["role"] in set(roles)]
