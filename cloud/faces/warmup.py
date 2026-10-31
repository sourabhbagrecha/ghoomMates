"""Docker build step: downloads both models' weights into $DEEPFACE_HOME so instances never fetch them."""

from faces.config import Settings
from faces.pipeline import FaceEngine

if __name__ == "__main__":
    FaceEngine(Settings.from_env()).warm_up()
    print("model weights ready")
