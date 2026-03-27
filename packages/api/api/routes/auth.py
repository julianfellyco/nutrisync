from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from api.db.engine import get_db
from api.db.models import ClientProfile, User
from api.middleware.auth import (
    create_access_token,
    create_refresh_token,
    get_current_user,
    hash_password,
    verify_password,
)

router = APIRouter(prefix="/auth", tags=["auth"])


class RegisterRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    email: EmailStr
    password: str = Field(..., min_length=8, max_length=128)
    role: str = Field(..., max_length=20)  # "client" | "consultant"


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(..., max_length=128)


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


@router.post("/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
async def register(body: RegisterRequest, db: AsyncSession = Depends(get_db)):
    if body.role not in ("client", "consultant"):
        raise HTTPException(status_code=400, detail="role must be 'client' or 'consultant'")

    existing = await db.execute(select(User).where(User.email == body.email))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Email already registered")

    user = User(
        email=body.email,
        hashed_password=hash_password(body.password),
        role=body.role,
        name=body.name,
    )
    db.add(user)
    await db.flush()  # get user.id before committing

    if body.role == "client":
        db.add(ClientProfile(user_id=user.id))

    await db.commit()

    return TokenResponse(
        access_token=create_access_token(user.id, user.role),
        refresh_token=create_refresh_token(user.id),
    )


@router.post("/login", response_model=TokenResponse)
async def login(body: LoginRequest, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.email == body.email))
    user = result.scalar_one_or_none()

    if not user or not verify_password(body.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid credentials")

    return TokenResponse(
        access_token=create_access_token(user.id, user.role),
        refresh_token=create_refresh_token(user.id),
    )


@router.post("/refresh", response_model=TokenResponse)
async def refresh(body: dict, db: AsyncSession = Depends(get_db)):
    from jose import JWTError, jwt
    from api.config import settings as cfg
    token = body.get("refresh_token", "")
    exc = HTTPException(status_code=401, detail="Invalid refresh token")
    try:
        payload = jwt.decode(token, cfg.jwt_secret, algorithms=[cfg.jwt_algorithm])
        if payload.get("type") != "refresh":
            raise exc
        user_id: str = payload["sub"]
    except (JWTError, KeyError):
        raise exc
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user or not user.is_active:
        raise exc
    return TokenResponse(
        access_token=create_access_token(user.id, user.role),
        refresh_token=create_refresh_token(user.id),
    )


class UpdateMeRequest(BaseModel):
    name: str | None = None


@router.patch("/me")
async def update_me(body: UpdateMeRequest, current_user: User = Depends(get_current_user),
                    db: AsyncSession = Depends(get_db)):
    if body.name:
        current_user.name = body.name
        await db.commit()
    return {"id": current_user.id, "email": current_user.email,
            "name": current_user.name, "role": current_user.role}


@router.get("/me")
async def me(current_user: User = Depends(get_current_user)):
    return {"id": current_user.id, "email": current_user.email,
            "name": current_user.name, "role": current_user.role}
