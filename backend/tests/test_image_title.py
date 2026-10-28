"""Title persistence, backwards compatibility, and metadata regression tests."""
import asyncio
import base64
import io
import os
import sqlite3
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

_tmp = tempfile.TemporaryDirectory()
_db_path = Path(_tmp.name) / "titles.db"
os.environ["DATABASE_URL"] = f"sqlite:///{_db_path.as_posix()}"
# Start with pre-title tables to exercise the production upgrade path.
with sqlite3.connect(_db_path) as connection:
    connection.execute("CREATE TABLE images (id INTEGER PRIMARY KEY, prompt VARCHAR(500), keywords VARCHAR(255), description TEXT, file_path VARCHAR(1000), preview_url VARCHAR(255), created_at DATETIME)")
    connection.execute("CREATE TABLE workspace_rows (id INTEGER PRIMARY KEY)")
    connection.execute("INSERT INTO images (id, prompt, file_path, preview_url) VALUES (1, 'existing description', 'old.png', '/old.png')")

connection.close()

from PIL import Image as PILImage
from pydantic import ValidationError
from app.database import SessionLocal, engine, init_db
from app.models import Image, WorkspaceRow
from app.routes.generate import UploadDraftRequest, upload_generated_draft
from app.routes.images import ImageMetadataUpdateRequest, ImageRenameRequest, update_image_metadata, rename_image, cos_file_to_dict
from app.routes.workspace import WorkspaceRowPayload, apply_payload, row_to_dict
from app.services.image_record_service import create_image_record, image_to_dict
from app.services.remote_storage_service import RemoteFileInfo

init_db()

class ImageTitleTests(unittest.TestCase):
    def setUp(self):
        self.db = SessionLocal()
        self.remote = RemoteFileInfo(file_name="test.png", remote_path="test/test.png", file_size=10)

    def tearDown(self):
        self.db.close()

    def create_image(self, title=""):
        return create_image_record(self.db, prompt="original description", description="original description", keywords="", remote_info=self.remote, source="generated", title=title)

    def test_upgrade_is_repeatable_and_preserves_old_images(self):
        init_db()
        image = self.db.get(Image, 1)
        self.assertEqual(image_to_dict(image)["title"], "existing description")
        self.assertEqual(image_to_dict(image)["customTitle"], "")

    def test_custom_title_fallback_and_cos_gallery(self):
        for title, expected in [("  manual title  ", "manual title"), ("", "original description"), ("  ", "original description")]:
            image = self.create_image(title)
            self.assertEqual(image_to_dict(image)["title"], expected)
            self.assertEqual(image.prompt, "original description")
            self.assertEqual(cos_file_to_dict(self.remote, {self.remote.remote_path: image}, 0)["title"], expected)

    def test_metadata_clear_and_legacy_requests(self):
        image = self.create_image("manual title")
        asyncio.run(update_image_metadata(image.id, ImageMetadataUpdateRequest(originalPrompt="changed description"), {}, self.db))
        self.assertEqual(image.title, "manual title")
        result = asyncio.run(update_image_metadata(image.id, ImageMetadataUpdateRequest(title="  ", originalPrompt="changed description"), {}, self.db))
        self.assertEqual(result["image"]["title"], "changed description")

    def test_rename_preserves_original_prompt(self):
        image = self.create_image()
        result = asyncio.run(rename_image(image.id, ImageRenameRequest(name="renamed title"), {}, self.db))
        self.assertEqual(result["image"]["title"], "renamed title")
        self.assertEqual(image.prompt, "original description")

    def test_workspace_title_round_trip(self):
        row = WorkspaceRow(user_id="test", row_key="title-test")
        apply_payload(row, WorkspaceRowPayload(title="  saved title  ", originalPrompt="description"))
        self.db.add(row)
        self.db.commit()
        self.db.expire_all()
        self.assertEqual(row_to_dict(row)["title"], "saved title")
        apply_payload(row, WorkspaceRowPayload(title="", originalPrompt="description"))
        self.assertEqual(row_to_dict(row)["title"], "")

    def test_upload_passes_title_to_persistent_record(self):
        buffer = io.BytesIO()
        PILImage.new("RGB", (2, 2)).save(buffer, "PNG")
        for title, expected in [("upload title", "upload title"), ("", "input description")]:
            request = UploadDraftRequest(prompt="input description", title=title, image_base64=base64.b64encode(buffer.getvalue()).decode())
            with patch("app.routes.generate.SFTPStorageClient") as storage:
                storage.return_value.upload_bytes.return_value = self.remote
                result = asyncio.run(upload_generated_draft(request, {}, self.db))
            self.assertEqual(result.images[0]["title"], expected)
            self.assertEqual(result.images[0]["originalPrompt"], "input description")

    def test_title_length_validation(self):
        with self.assertRaises(ValidationError):
            WorkspaceRowPayload(title="x" * 201)
        with self.assertRaises(ValidationError):
            UploadDraftRequest(prompt="description", title="x" * 201, image_base64="")

if __name__ == "__main__":
    try:
        unittest.main()
    finally:
        engine.dispose()
        _tmp.cleanup()
