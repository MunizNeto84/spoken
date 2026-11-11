from urllib.parse import urlparse
from authlib.integrations.base_client.errors import OAuthError
from flask import current_app, flash, redirect, render_template, request, url_for
from flask_login import current_user, login_user, logout_user
from app.auth import auth_bp
from app.auth.services.auth_service import AuthenticationError, authenticate_user, register_user, find_or_create_google_user
from app.extensions import oauth

def _safe_next(target):
    if not target:
        return False
    parsed = urlparse(target)
    return not parsed.netloc and not parsed.scheme and target.startswith("/") and not target.startswith("//")

@auth_bp.route("/login", methods=["GET", "POST"])
def login():
    if current_user.is_authenticated:
        return redirect(url_for("main.index"))
    if request.method == "POST":
        user = authenticate_user(request.form.get("email"), request.form.get("password"))
        if user is None:
            flash("E-mail ou senha incorretos.", "error")
            return render_template("auth/login.html"), 401
        login_user(user, remember=request.form.get("remember") == "1")
        target = request.args.get("next")
        return redirect(target if _safe_next(target) else url_for("main.index"))
    return render_template("auth/login.html")

@auth_bp.route("/register", methods=["GET", "POST"])
def register():
    if current_user.is_authenticated:
        return redirect(url_for("main.index"))
    if request.method == "POST":
        try:
            user = register_user(request.form.get("name"), request.form.get("email"), request.form.get("password"))
            login_user(user)
            flash("Conta criada com sucesso!", "success")
            return redirect(url_for("main.index"))
        except AuthenticationError as exc:
            flash(str(exc), "error")
            return render_template("auth/register.html"), 400
    return render_template("auth/register.html")

@auth_bp.get("/google")
def google_login():
    if not current_app.config.get("GOOGLE_CLIENT_ID") or not current_app.config.get("GOOGLE_CLIENT_SECRET"):
        flash("Configure as credenciais Google no .env.", "error")
        return redirect(url_for("auth.login"))
    redirect_uri = current_app.config["GOOGLE_REDIRECT_URI"]
    return oauth.google.authorize_redirect(redirect_uri)

@auth_bp.get("/google/callback")
def google_callback():
    try:
        token = oauth.google.authorize_access_token()
        info = token.get("userinfo")
        if not info or info.get("email_verified") not in (True, "true", "True", 1):
            raise AuthenticationError("O Google não confirmou o e-mail desta conta.")
        user = find_or_create_google_user(info.get("sub"), info.get("email"),
                                          info.get("name"), info.get("picture"))
        login_user(user)
        flash("Login com Google realizado!", "success")
        return redirect(url_for("main.index"))
    except (OAuthError, AuthenticationError) as exc:
        current_app.logger.warning("Falha no login Google: %s", exc)
        flash(str(exc), "error")
    except Exception:
        current_app.logger.exception("Erro no callback Google.")
        flash("Não foi possível concluir o login Google.", "error")
    return redirect(url_for("auth.login"))

@auth_bp.post("/logout")
def logout():
    logout_user()
    flash("Você saiu da sua conta.", "success")
    return redirect(url_for("auth.login"))
