import re
from sqlalchemy.exc import IntegrityError
from app.extensions import db
from app.models import User

class AuthenticationError(Exception):
    pass

def normalize_email(email):
    return (email or "").strip().lower()

def register_user(name, email, password):
    name = (name or "").strip()
    email = normalize_email(email)
    password = password or ""
    if not 2 <= len(name) <= 120:
        raise AuthenticationError("Informe um nome entre 2 e 120 caracteres.")
    if not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", email):
        raise AuthenticationError("Informe um e-mail válido.")
    if not 10 <= len(password) <= 128:
        raise AuthenticationError("A senha precisa ter entre 10 e 128 caracteres.")
    if db.session.scalar(db.select(User).where(User.email == email)):
        raise AuthenticationError("Já existe uma conta com este e-mail.")
    user = User(name=name, email=email)
    user.set_password(password)
    db.session.add(user)
    try:
        db.session.commit()
    except IntegrityError as exc:
        db.session.rollback()
        raise AuthenticationError("Não foi possível criar a conta. Verifique o e-mail.") from exc
    return user

def authenticate_user(email, password):
    user = db.session.scalar(db.select(User).where(User.email == normalize_email(email)))
    return user if user and user.check_password(password or "") else None

def find_or_create_google_user(google_id, email, name, picture):
    google_id = (google_id or "").strip()
    email = normalize_email(email)
    if not google_id or not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", email):
        raise AuthenticationError("O Google não retornou os dados obrigatórios.")
    user = db.session.scalar(db.select(User).where(User.google_id == google_id))
    if user:
        user.name = (name or user.name)[:120]
        user.profile_picture = picture
        db.session.commit()
        return user
    if db.session.scalar(db.select(User).where(User.email == email)):
        raise AuthenticationError("Este e-mail já possui conta no Spoken. Entre com a senha; a vinculação será feita em um fluxo separado.")
    user = User(name=(name or email.split("@")[0])[:120], email=email,
                google_id=google_id, profile_picture=picture)
    db.session.add(user)
    try:
        db.session.commit()
    except IntegrityError as exc:
        db.session.rollback()
        raise AuthenticationError("Não foi possível criar a conta Google. Tente novamente.") from exc
    return user
