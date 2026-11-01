from __future__ import annotations

import hashlib
import time
from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials
from sqlalchemy import delete
from pydantic import BaseModel
from sqlmodel import Session, select

from ..auth import (_bearer, capabilities_for, create_token, current_user, decode_token, demo_accounts,
                    seed_users, verify_password)
from ..config import get_settings
from ..db import RevokedToken, User, get_session

router = APIRouter(prefix="/api/auth", tags=["auth"])


class LoginIn(BaseModel):
    email: str
    password: str


def _session_payload(user: User) -> dict:
    return {
        "token": create_token(user),
        "user": {"id": user.id, "email": user.email, "name": user.name, "role": user.role,
                 "department": user.department, "faculty_id": user.faculty_id,
                 "group_id": user.group_id},
        "capabilities": capabilities_for(user.role),
    }


@router.post("/login")
def login(body: LoginIn, session: Session = Depends(get_session)):
    user = session.exec(select(User).where(User.email == body.email.strip().lower())).first()
    if user is None or not verify_password(body.password, user.password_hash):
        raise HTTPException(401, "wrong email or password")
    return _session_payload(user)


@router.post("/demo-login/{role}")
def demo_login(role: str, email: str | None = None, session: Session = Depends(get_session)):
    """One-click login for judges: no password typing, but still a real token.

    `role` may be admin / department_coordinator / faculty / club. Two admins exist so that
    "nobody approves their own request" can be demonstrated; pass ?email=dean@cit.edu to
    sign in as the second one.
    """
    if not get_settings().demo_login_enabled:
        raise HTTPException(403, "demo login is disabled")
    matches = [a for a in demo_accounts() if a["role"] == role]
    if not matches:
        raise HTTPException(404, f"no demo account for role {role!r}")
    chosen = next((m for m in matches if m["email"] == email), matches[0]) if email else matches[0]
    user = session.exec(select(User).where(User.email == chosen["email"])).first()
    if user is None:
        seed_users(session)
        user = session.exec(select(User).where(User.email == chosen["email"])).first()
    if user is None:
        raise HTTPException(500, "demo account could not be seeded")
    return _session_payload(user)


@router.get("/accounts")
def accounts(session: Session = Depends(get_session)):
    return {"accounts": demo_accounts(), "password_hint": "see README (demo password from .env)"}


@router.get("/me")
def me(user: User = Depends(current_user)):
    return {"user": {"id": user.id, "email": user.email, "name": user.name, "role": user.role,
                     "department": user.department, "faculty_id": user.faculty_id,
                     "group_id": user.group_id},
            "capabilities": capabilities_for(user.role)}


@router.post("/logout")
def logout(user: User = Depends(current_user),
           creds: HTTPAuthorizationCredentials = Depends(_bearer),
           session: Session = Depends(get_session)):
    payload = decode_token(creds.credentials)
    session.exec(delete(RevokedToken).where(RevokedToken.expires_at <= int(time.time())))
    session.add(RevokedToken(token_hash=hashlib.sha256(creds.credentials.encode("utf-8")).hexdigest(),
                             expires_at=int(payload["exp"])))
    session.commit()
    return {"ok": True}
