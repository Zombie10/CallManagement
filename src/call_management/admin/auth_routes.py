"""Admin authentication: password login + WebAuthn passkeys."""

from __future__ import annotations

import os
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel, Field
from webauthn import (
    generate_authentication_options,
    generate_registration_options,
    verify_authentication_response,
    verify_registration_response,
)
from webauthn.helpers import bytes_to_base64url, base64url_to_bytes
from webauthn.helpers.structs import (
    AuthenticatorSelectionCriteria,
    AuthenticatorTransport,
    PublicKeyCredentialDescriptor,
    ResidentKeyRequirement,
    UserVerificationRequirement,
)

from call_management.admin.auth_permissions import ROLES, default_route_for_role, normalize_role
from call_management.admin.auth_store import (
    SESSION_COOKIE,
    change_own_password,
    create_session,
    create_user,
    delete_session,
    delete_user,
    delete_user_credential,
    ensure_bootstrap_user,
    get_credential_by_id,
    get_session_user,
    get_user_by_id,
    get_user_by_username,
    list_credentials_for_username,
    list_user_credentials,
    list_users,
    pop_challenge,
    save_credential,
    store_challenge,
    update_credential_sign_count,
    update_own_profile,
    update_user,
    verify_user_password,
)

router = APIRouter(prefix="/api/auth", tags=["auth"])

PUBLIC_PATHS = frozenset(
    {
        "/api/auth/login",
        "/api/auth/passkey/login/options",
        "/api/auth/passkey/login/verify",
        "/api/auth/status",
        "/api/health",
    }
)


def _rp_id() -> str:
    return os.getenv("ADMIN_RP_ID", "localhost").strip()


def _origin() -> str:
    return os.getenv("ADMIN_ORIGIN", "http://127.0.0.1:8080").strip()


def _cookie_secure() -> bool:
    return os.getenv("ADMIN_COOKIE_SECURE", "false").lower() == "true"


def _set_session_cookie(response: Response, session_id: str) -> None:
    response.set_cookie(
        key=SESSION_COOKIE,
        value=session_id,
        httponly=True,
        secure=_cookie_secure(),
        samesite="lax",
        max_age=60 * 60 * int(os.getenv("ADMIN_SESSION_HOURS", "168")),
        path="/",
    )


def _clear_session_cookie(response: Response) -> None:
    response.delete_cookie(SESSION_COOKIE, path="/")


def get_current_user(request: Request) -> dict[str, str | bool]:
    session_id = request.cookies.get(SESSION_COOKIE)
    user = get_session_user(session_id)
    if not user:
        raise HTTPException(status_code=401, detail="No autenticado")
    return {
        "id": user.id,
        "username": user.username,
        "display_name": user.display_name,
        "role": user.role,
        "enabled": user.enabled,
    }


def require_admin(user: dict = Depends(get_current_user)) -> dict:
    if normalize_role(str(user.get("role"))) != "admin":
        raise HTTPException(status_code=403, detail="Solo administradores")
    return user


class PasswordLoginPayload(BaseModel):
    username: str
    password: str


class PasskeyOptionsPayload(BaseModel):
    username: str | None = None


class PasskeyVerifyPayload(BaseModel):
    challenge_id: str
    credential: dict[str, Any]


class PasskeyRegisterPayload(BaseModel):
    challenge_id: str
    credential: dict[str, Any]
    device_name: str = "Passkey"


class PasskeyRegisterOptionsPayload(BaseModel):
    device_name: str = "Passkey"


class ProfileUpdatePayload(BaseModel):
    display_name: str = Field(min_length=1, max_length=80)


class PasswordChangePayload(BaseModel):
    current_password: str
    new_password: str = Field(min_length=8)


class AdminUserCreatePayload(BaseModel):
    username: str = Field(min_length=2, max_length=40)
    password: str = Field(min_length=8)
    display_name: str = Field(min_length=1, max_length=80)
    role: str = "playground"


class AdminUserUpdatePayload(BaseModel):
    display_name: str | None = None
    role: str | None = None
    enabled: bool | None = None
    password: str | None = Field(default=None, min_length=8)


def _user_payload(user) -> dict[str, Any]:
    return {
        "id": user.id,
        "username": user.username,
        "display_name": user.display_name,
        "role": user.role,
        "enabled": user.enabled,
    }


@router.get("/status")
async def auth_status():
    ensure_bootstrap_user()
    password_configured = bool(os.getenv("ADMIN_PASSWORD", "").strip())
    return {
        "enabled": True,
        "rp_id": _rp_id(),
        "origin": _origin(),
        "passkey_supported": True,
        "password_configured": password_configured,
        "hint": (
            "Usa la pestaña Contraseña. Si no funciona, define ADMIN_PASSWORD en .env y reinicia el admin."
            if not password_configured
            else "Inicia con tu ADMIN_PASSWORD o registra un passkey tras entrar."
        ),
    }


@router.get("/roles")
async def auth_roles():
    return {"roles": ROLES}


@router.get("/me")
async def auth_me(user: dict = Depends(get_current_user)):
    creds = list_user_credentials(user["id"])
    return {
        **user,
        "passkeys": creds,
        "has_passkeys": len(creds) > 0,
        "default_route": default_route_for_role(str(user["role"])),
    }


@router.patch("/me")
async def update_profile(payload: ProfileUpdatePayload, user: dict = Depends(get_current_user)):
    updated = update_own_profile(user["id"], display_name=payload.display_name)
    return _user_payload(updated)


@router.post("/me/password")
async def change_password(payload: PasswordChangePayload, user: dict = Depends(get_current_user)):
    try:
        change_own_password(
            user["id"],
            current_password=payload.current_password,
            new_password=payload.new_password,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"ok": True}


@router.delete("/passkey/{credential_id}")
async def remove_passkey(credential_id: str, user: dict = Depends(get_current_user)):
    try:
        delete_user_credential(user["id"], credential_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return {"deleted": credential_id}


@router.get("/users")
async def list_admin_users(_admin: dict = Depends(require_admin)):
    return {"users": [_user_payload(u) for u in list_users()]}


@router.post("/users")
async def create_admin_user(payload: AdminUserCreatePayload, _admin: dict = Depends(require_admin)):
    try:
        created = create_user(
            username=payload.username,
            password=payload.password,
            display_name=payload.display_name,
            role=payload.role,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return _user_payload(created)


@router.patch("/users/{user_id}")
async def patch_admin_user(
    user_id: str,
    payload: AdminUserUpdatePayload,
    _admin: dict = Depends(require_admin),
):
    try:
        updated = update_user(
            user_id,
            display_name=payload.display_name,
            role=payload.role,
            enabled=payload.enabled,
            password=payload.password,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return _user_payload(updated)


@router.delete("/users/{user_id}")
async def remove_admin_user(user_id: str, admin: dict = Depends(require_admin)):
    if user_id == admin["id"]:
        raise HTTPException(status_code=400, detail="No puedes eliminar tu propia cuenta")
    try:
        delete_user(user_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"deleted": user_id}


@router.post("/login")
async def password_login(payload: PasswordLoginPayload, response: Response):
    ensure_bootstrap_user()
    user = verify_user_password(payload.username, payload.password)
    if not user:
        raise HTTPException(status_code=401, detail="Usuario o contraseña incorrectos")
    session_id, _ = create_session(user.id)
    _set_session_cookie(response, session_id)
    return {
        "username": user.username,
        "display_name": user.display_name,
        "role": user.role,
        "default_route": default_route_for_role(user.role),
    }


@router.post("/logout")
async def logout(request: Request, response: Response):
    session_id = request.cookies.get(SESSION_COOKIE)
    if session_id:
        delete_session(session_id)
    _clear_session_cookie(response)
    return {"ok": True}


@router.post("/passkey/register/options")
async def passkey_register_options(
    payload: PasskeyRegisterOptionsPayload,
    user: dict = Depends(get_current_user),
):
    options = generate_registration_options(
        rp_id=_rp_id(),
        rp_name="Call Management Admin",
        user_id=user["id"].encode(),
        user_name=user["username"],
        user_display_name=user["display_name"],
        authenticator_selection=AuthenticatorSelectionCriteria(
            resident_key=ResidentKeyRequirement.PREFERRED,
            user_verification=UserVerificationRequirement.REQUIRED,
        ),
    )
    challenge_id = store_challenge(challenge=options.challenge, purpose="register", user_id=user["id"])
    return {
        "challenge_id": challenge_id,
        "options": {
            "rp": {"id": options.rp.id, "name": options.rp.name},
            "user": {
                "id": bytes_to_base64url(options.user.id),
                "name": options.user.name,
                "displayName": options.user.display_name,
            },
            "challenge": bytes_to_base64url(options.challenge),
            "pubKeyCredParams": [{"type": p.type, "alg": p.alg} for p in options.pub_key_cred_params],
            "timeout": options.timeout,
            "excludeCredentials": [],
            "authenticatorSelection": {
                "residentKey": "preferred",
                "userVerification": "required",
            },
            "attestation": options.attestation,
        },
        "device_name": payload.device_name,
    }


@router.post("/passkey/register/verify")
async def passkey_register_verify(payload: PasskeyRegisterPayload, user: dict = Depends(get_current_user)):
    stored = pop_challenge(payload.challenge_id, "register")
    if not stored or stored[1] != user["id"]:
        raise HTTPException(status_code=400, detail="Challenge inválido o expirado")

    expected_challenge, _ = stored
    try:
        verification = verify_registration_response(
            credential=payload.credential,
            expected_challenge=expected_challenge,
            expected_rp_id=_rp_id(),
            expected_origin=_origin(),
            require_user_verification=True,
        )
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Registro passkey falló: {exc}") from exc

    transports = None
    raw_transports = payload.credential.get("response", {}).get("transports")
    if isinstance(raw_transports, list):
        transports = raw_transports

    save_credential(
        user_id=user["id"],
        credential_id=verification.credential_id,
        public_key=verification.credential_public_key,
        sign_count=verification.sign_count,
        transports=transports,
        device_name=payload.device_name or "Passkey",
    )
    return {"registered": True, "device_name": payload.device_name}


@router.post("/passkey/login/options")
async def passkey_login_options(payload: PasskeyOptionsPayload):
    ensure_bootstrap_user()
    allow_credentials: list[PublicKeyCredentialDescriptor] = []
    if payload.username:
        for row in list_credentials_for_username(payload.username):
            transports = []
            try:
                import json

                raw = json.loads(row.get("transports") or "[]")
                transports = [AuthenticatorTransport(t) for t in raw if t]
            except Exception:
                transports = []
            allow_credentials.append(
                PublicKeyCredentialDescriptor(
                    id=row["credential_id"],
                    transports=transports or None,
                )
            )

    options = generate_authentication_options(
        rp_id=_rp_id(),
        allow_credentials=allow_credentials or None,
        user_verification=UserVerificationRequirement.REQUIRED,
    )
    user_id = get_user_by_username(payload.username or "") if payload.username else None
    challenge_id = store_challenge(
        challenge=options.challenge,
        purpose="login",
        user_id=user_id.id if user_id else None,
    )
    return {
        "challenge_id": challenge_id,
        "options": {
            "challenge": bytes_to_base64url(options.challenge),
            "timeout": options.timeout,
            "rpId": options.rp_id,
            "allowCredentials": [
                {
                    "type": "public-key",
                    "id": bytes_to_base64url(c.id),
                    "transports": [t.value for t in (c.transports or [])],
                }
                for c in (options.allow_credentials or [])
            ],
            "userVerification": "required",
        },
    }


@router.post("/passkey/login/verify")
async def passkey_login_verify(payload: PasskeyVerifyPayload, response: Response):
    stored = pop_challenge(payload.challenge_id, "login")
    if not stored:
        raise HTTPException(status_code=400, detail="Challenge inválido o expirado")

    expected_challenge, _ = stored
    cred_id_b64 = payload.credential.get("id") or payload.credential.get("rawId")
    if not cred_id_b64:
        raise HTTPException(status_code=400, detail="Credential ID faltante")

    credential_id = base64url_to_bytes(cred_id_b64)
    row = get_credential_by_id(credential_id)
    if not row:
        raise HTTPException(status_code=401, detail="Passkey no reconocido")

    try:
        verification = verify_authentication_response(
            credential=payload.credential,
            expected_challenge=expected_challenge,
            expected_rp_id=_rp_id(),
            expected_origin=_origin(),
            credential_public_key=row["public_key"],
            credential_current_sign_count=row["sign_count"],
            require_user_verification=True,
        )
    except Exception as exc:
        raise HTTPException(status_code=401, detail=f"Passkey inválido: {exc}") from exc

    update_credential_sign_count(row["id"], verification.new_sign_count)
    user = get_user_by_id(row["user_id"])
    if not user or not user.enabled:
        raise HTTPException(status_code=401, detail="Usuario desactivado")
    session_id, _ = create_session(row["user_id"])
    _set_session_cookie(response, session_id)
    return {
        "username": user.username,
        "display_name": user.display_name,
        "role": user.role,
        "default_route": default_route_for_role(user.role),
    }