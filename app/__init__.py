import os
from flask import Flask
from app.routes import bp as main_bp


def create_app() -> Flask:
    app = Flask(__name__)
    os.makedirs("temp_audio", exist_ok=True)
    app.register_blueprint(main_bp)
    return app
