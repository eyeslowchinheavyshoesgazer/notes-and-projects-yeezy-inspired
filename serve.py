import base64
import binascii
import json
import re
import shutil
from datetime import datetime, timezone
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Lock
from uuid import uuid4


PROJECT_ROOT = Path(__file__).resolve().parent
DIST_DIR = PROJECT_ROOT / "dist"
FEEDBACK_PATH = PROJECT_ROOT / "feedback.jsonl"
FEEDBACK_IMAGES_PATH = PROJECT_ROOT / "feedback-images"
WORK_SLUG = re.compile(r"[a-z0-9]+(?:-[a-z0-9]+)*")
MAX_MESSAGE_LENGTH = 3000
MAX_IMAGES = 4
MAX_IMAGE_BYTES = 5 * 1024 * 1024
MAX_ENCODED_IMAGE_LENGTH = 4 * ((MAX_IMAGE_BYTES + 2) // 3)
MAX_BODY_BYTES = MAX_IMAGES * MAX_ENCODED_IMAGE_LENGTH + 64 * 1024
IMAGE_PREFIXES = {
    "data:image/png;base64": (".png", b"\x89PNG\r\n\x1a\n"),
    "data:image/jpeg;base64": (".jpg", b"\xff\xd8\xff"),
    "data:image/webp;base64": (".webp", b"RIFF"),
}
FEEDBACK_LOCK = Lock()


def decode_image_bytes(encoded):
    if len(encoded) > MAX_ENCODED_IMAGE_LENGTH:
        raise ValueError("Each image must be 5 MB or smaller.")

    try:
        contents = base64.b64decode(encoded, validate=True)
    except (binascii.Error, ValueError):
        raise ValueError("The image attachment has invalid data.") from None
    if len(contents) > MAX_IMAGE_BYTES:
        raise ValueError("Each image must be 5 MB or smaller.")
    return contents


def decode_images(images):
    if not isinstance(images, list) or len(images) > MAX_IMAGES:
        raise ValueError("Attach up to 4 images.")

    attachments = []
    for image in images:
        if not isinstance(image, dict):
            raise ValueError("The image attachment has an invalid format.")

        name = image.get("name")
        data = image.get("data")
        if not isinstance(name, str) or not name.strip() or len(name) > 255 or not isinstance(data, str):
            raise ValueError("The image attachment has an invalid name or format.")

        prefix, _, encoded = data.partition(",")
        if prefix not in IMAGE_PREFIXES:
            raise ValueError("Attach PNG, JPEG, or WebP images.")
        contents = decode_image_bytes(encoded)

        extension, signature = IMAGE_PREFIXES[prefix]
        if not contents.startswith(signature) or (extension == ".webp" and contents[8:12] != b"WEBP"):
            raise ValueError("The image data does not match its file type.")

        attachments.append((name, extension, contents))

    return attachments


def save_report(record, images):
    directory = FEEDBACK_IMAGES_PATH / uuid4().hex
    writes = []
    if images is not None:
        record["images"] = []
        for index, (name, extension, contents) in enumerate(images, start=1):
            path = directory / f"{index}{extension}"
            record["images"].append({"name": name, "path": path.relative_to(PROJECT_ROOT).as_posix()})
            writes.append((path, contents))

    line = (json.dumps(record, ensure_ascii=False) + "\n").encode("utf-8")
    created_directory = False
    try:
        with FEEDBACK_LOCK:
            if writes:
                directory.mkdir(parents=True)
                created_directory = True
                for path, contents in writes:
                    if path.write_bytes(contents) != len(contents):
                        raise OSError("Incomplete feedback image write")

            with FEEDBACK_PATH.open("ab", buffering=0) as feedback:
                offset = feedback.tell()
                try:
                    if feedback.write(line) != len(line):
                        raise OSError("Incomplete feedback write")
                except OSError:
                    feedback.truncate(offset)
                    raise
    except OSError:
        if created_directory:
            shutil.rmtree(directory, ignore_errors=True)
        raise


class FeedbackHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(DIST_DIR), **kwargs)

    def end_headers(self):
        self.send_header("Cache-Control", "no-cache")
        super().end_headers()

    def send_json(self, status, payload):
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self):
        if self.path.partition("?")[0] != "/api/feedback":
            self.send_json(HTTPStatus.NOT_FOUND, {"error": "Not found."})
            return

        if self.headers.get_content_type() != "application/json":
            self.send_json(HTTPStatus.UNSUPPORTED_MEDIA_TYPE, {"error": "Send the report as JSON."})
            return

        try:
            length = int(self.headers.get("Content-Length", ""))
            if length < 1:
                raise ValueError
        except ValueError:
            self.send_json(HTTPStatus.BAD_REQUEST, {"error": "The report is empty or has an invalid format."})
            return

        if length > MAX_BODY_BYTES:
            self.send_json(HTTPStatus.REQUEST_ENTITY_TOO_LARGE, {"error": "The report is too long."})
            return

        try:
            payload = json.loads(self.rfile.read(length).decode("utf-8"))
        except (ValueError, RecursionError):
            self.send_json(HTTPStatus.BAD_REQUEST, {"error": "The report has an invalid format."})
            return

        if not isinstance(payload, dict):
            self.send_json(HTTPStatus.BAD_REQUEST, {"error": "The report has an invalid format."})
            return

        work = payload.get("work")
        if (not isinstance(work, str) or len(work) > 100 or not WORK_SLUG.fullmatch(work)
                or not (DIST_DIR / "entries" / f"{work}.html").is_file()):
            self.send_json(HTTPStatus.BAD_REQUEST, {"error": "Select an entry from the list."})
            return

        message = payload.get("message")
        if not isinstance(message, str) or not message.strip() or len(message) > MAX_MESSAGE_LENGTH:
            self.send_json(HTTPStatus.BAD_REQUEST, {"error": "Enter 1 to 3,000 characters."})
            return

        # Older versions of the form still send an empty files array.
        if payload.get("files", []) != []:
            self.send_json(HTTPStatus.BAD_REQUEST, {"error": "Only image attachments are supported."})
            return

        try:
            images = decode_images(payload["images"]) if "images" in payload else None
        except ValueError as error:
            self.send_json(HTTPStatus.BAD_REQUEST, {"error": str(error)})
            return

        record = {"timestamp": datetime.now(timezone.utc).isoformat(), "work": work, "message": message}
        try:
            save_report(record, images)
        except UnicodeEncodeError:
            self.send_json(HTTPStatus.BAD_REQUEST, {"error": "The report contains characters that cannot be saved."})
            return
        except OSError as error:
            self.log_error("Could not save feedback: %s", error)
            self.send_json(HTTPStatus.INTERNAL_SERVER_ERROR, {"error": "Could not save the report. Try again later."})
            return

        result = {"ok": True}
        if images is not None:
            result["imageCount"] = len(images)
        if "files" in payload:
            result["fileCount"] = 0
        self.send_json(HTTPStatus.CREATED, result)


if __name__ == "__main__":
    with ThreadingHTTPServer(("127.0.0.1", 4321), FeedbackHandler) as server:
        print("Local preview http://127.0.0.1:4321/", flush=True)
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            pass
