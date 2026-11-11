import os
from pathlib import Path
from dotenv import load_dotenv
from flask import Flask, jsonify, redirect, request, url_for
from app.extensions import csrf, db, login_manager, migrate, oauth

def create_app(test_config=None):
    load_dotenv(os.getenv("ENV_FILE", ".env"))
    app = Flask(__name__, instance_relative_config=True)
    Path(app.instance_path).mkdir(parents=True, exist_ok=True)
    Path("temp_audio").mkdir(parents=True, exist_ok=True)
    db_path = Path(app.instance_path) / "spoken.sqlite3"
    app.config.from_mapping(
        SECRET_KEY=os.getenv("SECRET_KEY"),
        SQLALCHEMY_DATABASE_URI=os.getenv("DATABASE_URL", f"sqlite:///{db_path.as_posix()}"),
        SQLALCHEMY_TRACK_MODIFICATIONS=False,
        GOOGLE_CLIENT_ID=os.getenv("GOOGLE_CLIENT_ID"),
        GOOGLE_CLIENT_SECRET=os.getenv("GOOGLE_CLIENT_SECRET"),
        GOOGLE_REDIRECT_URI=os.getenv("GOOGLE_REDIRECT_URI", "http://localhost:5000/auth/google/callback"),
        SESSION_COOKIE_HTTPONLY=True, SESSION_COOKIE_SAMESITE="Lax",
        SESSION_COOKIE_SECURE=os.getenv("SESSION_COOKIE_SECURE", "false").lower() == "true",
        REMEMBER_COOKIE_HTTPONLY=True, REMEMBER_COOKIE_SAMESITE="Lax",
        REMEMBER_COOKIE_SECURE=os.getenv("SESSION_COOKIE_SECURE", "false").lower() == "true",
    )
    if test_config:
        app.config.update(test_config)
    if not app.config.get("SECRET_KEY"):
        raise RuntimeError("SECRET_KEY não definida. Configure uma chave forte no .env.")
    db.init_app(app)
    migrate.init_app(app, db)
    login_manager.init_app(app)
    csrf.init_app(app)
    oauth.init_app(app)
    login_manager.login_view = "auth.login"
    login_manager.login_message = "Entre na sua conta para continuar."

    @login_manager.unauthorized_handler
    def unauthorized():
        if request.path.startswith("/api/"):
            return jsonify({"error": "Autenticação necessária.", "login_url": url_for("auth.login")}), 401
        return redirect(url_for("auth.login", next=request.url))

    if app.config.get("GOOGLE_CLIENT_ID") and app.config.get("GOOGLE_CLIENT_SECRET"):
        oauth.register(
            name="google", client_id=app.config["GOOGLE_CLIENT_ID"],
            client_secret=app.config["GOOGLE_CLIENT_SECRET"],
            server_metadata_url="https://accounts.google.com/.well-known/openid-configuration",
            client_kwargs={"scope": "openid email profile"},
        )
    from app.models import User  # noqa: F401
    from app.auth import auth_bp
    from app.routes import bp as main_bp
    app.register_blueprint(auth_bp)
    app.register_blueprint(main_bp)
    return app
