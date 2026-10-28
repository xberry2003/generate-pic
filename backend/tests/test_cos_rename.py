"""COS-only rename regression tests against a temporary database."""
import asyncio
import atexit
import uuid
import unittest
from datetime import datetime
from unittest.mock import patch

import test_image_title as fixture
atexit.register(lambda: (fixture.engine.dispose(), fixture._tmp.cleanup()))
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient
from app.database import get_db
from app.models import Image
from app.routes.images import router, rename_image, ImageRenameRequest
from app.services.auth_service import create_session_cookie
from app.services.remote_storage_service import RemoteFileInfo, RemoteStorageError

class CosRenameTests(unittest.TestCase):
    def setUp(self):
        self.db = fixture.SessionLocal()
        self.key = "ppt-素材/图片素材/" + uuid.uuid4().hex + ".png"
        self.remote = RemoteFileInfo(file_name=self.key.rsplit("/", 1)[1], remote_path=self.key, file_size=123, modified_at=datetime(2020, 1, 1))
        self.patcher = patch("app.routes.images.SFTPStorageClient")
        self.storage = self.patcher.start().return_value
        self.storage.config = {"cos_key_prefix": "ppt-素材/图片素材"}
        self.storage.list_images.return_value = [self.remote]

    def tearDown(self):
        self.db.close()
        self.patcher.stop()

    def rename(self, id="cos-408", key=None, name="新标题"):
        return asyncio.run(rename_image(id, ImageRenameRequest(name=name, cosKey=self.key if key is None else key), {"role":"admin"}, self.db))

    def test_cos_only_image_is_persisted_without_moving_object(self):
        result = self.rename(name="  新标题  ")
        record = self.db.get(Image, result["image"]["id"])
        self.assertEqual(record.title, "新标题")
        self.assertEqual(record.remote_path, self.key)
        self.assertEqual(record.file_name, self.remote.file_name)
        self.assertEqual(record.created_at, datetime(2020, 1, 1))
        self.assertNotEqual(record.prompt, "新标题")
        self.storage.upload_bytes.assert_not_called()
        self.storage.delete_file.assert_not_called()
        self.db.expire_all()
        self.assertEqual(self.db.get(Image, record.id).title, "新标题")

    def test_stale_cos_id_reuses_metadata_record(self):
        first = self.rename()
        second = self.rename(id="cos-9999", name="再改标题")
        self.assertEqual(first["image"]["id"], second["image"]["id"])
        self.assertEqual(self.db.query(Image).filter(Image.remote_path == self.key).count(), 1)
        self.storage.list_images.assert_called_once()

    def test_numeric_id_still_works_and_preserves_prompt(self):
        first = self.rename()
        result = self.rename(id=str(first["image"]["id"]), name="数字ID标题")
        self.assertEqual(result["image"]["title"], "数字ID标题")
        self.assertEqual(result["image"]["prompt"], first["image"]["prompt"])

    def test_missing_or_invalid_keys_do_not_create_records(self):
        for key, status in [("",400),("ppt-素材/图片素材/../secret.png",400),("other/image.png",403)]:
            with self.subTest(key=key), self.assertRaises(HTTPException) as error:
                self.rename(key=key)
            self.assertEqual(error.exception.status_code, status)
        self.assertIsNone(self.db.query(Image).filter(Image.remote_path == self.key).first())

    def test_missing_object_does_not_create_record(self):
        self.storage.list_images.return_value = []
        with self.assertRaises(HTTPException) as error:
            self.rename()
        self.assertEqual(error.exception.status_code,404)
        self.assertIsNone(self.db.query(Image).filter(Image.remote_path == self.key).first())

    def test_storage_failure_does_not_create_record(self):
        self.storage.list_images.side_effect = RemoteStorageError("storage unavailable")
        with self.assertRaises(HTTPException) as error:
            self.rename()
        self.assertEqual(error.exception.status_code,500)
        self.assertIsNone(self.db.query(Image).filter(Image.remote_path == self.key).first())

    def test_http_route_keeps_admin_boundary(self):
        app = FastAPI()
        app.include_router(router, prefix="/api")
        def db_dependency():
            yield self.db
        app.dependency_overrides[get_db] = db_dependency
        with TestClient(app) as client:
            url="/api/images/cos-408/name"
            body={"name":"标题","cosKey":self.key}
            self.assertEqual(client.patch(url,json=body).status_code,401)
            cookie=create_session_cookie("rename-test-employee-unique",{"name":"rename-test-employee-unique","role":"admin"})
            client.cookies.set("generate_pic_session",cookie)
            self.assertEqual(client.patch(url,json=body).status_code,403)
        self.storage.list_images.assert_not_called()

if __name__ == "__main__":
    unittest.main()
