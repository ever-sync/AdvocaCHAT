"""Queue/transport contract tests; entirely synthetic, with no network/provider calls."""
import hashlib
from pathlib import Path
import tempfile
import unittest
import signal
import time

from worker import PrivateApi, WorkerFailure, consume_one, validate_job

DATA = b"synthetic document bytes"
ID = "11111111-1111-4111-8111-111111111111"
LEASE = "22222222-2222-4222-8222-222222222222"
DOC = "33333333-3333-4333-8333-333333333333"
CASE = "44444444-4444-4444-8444-444444444444"
TENANT = "55555555-5555-4555-8555-555555555555"
VERSION = "66666666-6666-4666-8666-666666666666"


def job():
    return {"id": ID, "lease_token": LEASE, "document_id": DOC, "case_id": CASE, "tenant_id": TENANT, "category": "fiscal", "storage_path": TENANT + "/" + CASE + "/" + DOC, "source_sha256": hashlib.sha256(DATA).hexdigest(), "source_bytes": len(DATA), "mime_type": "application/pdf", "max_pages": 20}


def result():
    return {"source_sha256": hashlib.sha256(DATA).hexdigest(), "source_bytes": len(DATA), "mime_type": "application/pdf", "status": "complete", "pages": [{"page": 1, "text": "SYNTHETIC ONLY"}]}


class FakeApi:
    def __init__(self):
        self.jobs = [job()]
        self.calls = []
        self.bytes = DATA
        self.finish = {"job": {"id": ID, "state": "succeeded"}, "version_id": VERSION}
        self.lose_finish = False

    def rpc(self, name, payload):
        self.calls.append((name, payload))
        if name.endswith("claim"):
            return self.jobs
        if name.endswith("finish"):
            if self.lose_finish:
                raise WorkerFailure("network_unavailable")
            return self.finish
        return {"id": ID, "state": "failed"}

    def download(self, path):
        self.calls.append(("download", path))
        return self.bytes


class WorkerTests(unittest.TestCase):
    def run_one(self, api, processor=None):
        with tempfile.TemporaryDirectory() as directory:
            parent = Path(directory)
            output = consume_one(api, None, parent, processor or (lambda *_args, **_kwargs: result()))
            self.assertEqual(list(parent.iterdir()), [])
            return output

    def test_private_config_and_job_never_accept_arbitrary_document_urls(self):
        for url in ("http://example.invalid", "https://secret@example.invalid", "https://example.invalid/?redirect=x", "https://example.invalid/other"):
            with self.assertRaises(WorkerFailure):
                PrivateApi(url, "synthetic-key")
        PrivateApi("http://envoy.railway.internal:8000", "synthetic-key")
        for change in ({"storage_path": "https://example.invalid/private"}, {"storage_path": TENANT + "/../" + DOC}, {"source_bytes": 10485761}, {"max_pages": 21}, {"source_bytes": True}, {"mime_type": "image/jpeg"}):
            with self.assertRaises(WorkerFailure):
                validate_job({**job(), **change})

    def test_claim_empty_does_not_fetch_a_document(self):
        api = FakeApi()
        api.jobs = []
        self.assertEqual(self.run_one(api), {"state": "idle", "processed": 0})
        self.assertEqual(len(api.calls), 1)

    def test_more_than_one_claim_is_refused_without_network_download(self):
        api = FakeApi()
        api.jobs.append(job())
        with self.assertRaises(WorkerFailure):
            self.run_one(api)
        self.assertEqual(len(api.calls), 1)

    def test_matching_bytes_use_private_file_and_finalize_exact_kernel_result(self):
        api = FakeApi()
        def process(path, mime, **options):
            self.assertEqual(path.read_bytes(), DATA)
            self.assertEqual(path.stat().st_mode & 0o777, 0o600)
            self.assertEqual(path.parent.stat().st_mode & 0o777, 0o700)
            self.assertEqual(options["languages"], ["por"])
            self.assertEqual(options["limits"].pages, 20)
            self.assertEqual(mime, "application/pdf")
            return result()
        self.assertEqual(self.run_one(api, process)["state"], "succeeded")
        self.assertEqual(api.calls[-1][1]["p_result"], result())
        self.assertEqual(api.calls[-1][1]["p_lease_token"], LEASE)

    def test_mismatched_original_fails_before_processing(self):
        api = FakeApi()
        api.bytes = b"changed original"
        output = self.run_one(api, lambda *_args, **_kwargs: self.fail("must not process"))
        self.assertEqual(output["code"], "source_mismatch")
        self.assertFalse(api.calls[-1][1]["p_processing_started"])

    def test_processing_exception_cleans_files_and_keeps_conservative_consumption(self):
        api = FakeApi()
        def fail(*_args, **_kwargs):
            raise RuntimeError("PRIVATE source must not appear in output")
        output = self.run_one(api, fail)
        self.assertEqual(output["code"], "worker_failed")
        self.assertTrue(api.calls[-1][1]["p_processing_started"])
        self.assertNotIn("PRIVATE", str(output))

    def test_changed_kernel_hash_never_reaches_finish(self):
        api = FakeApi()
        output = self.run_one(api, lambda *_args, **_kwargs: {**result(), "source_sha256": "0" * 64})
        self.assertEqual(output["state"], "failed")
        self.assertEqual(api.calls[-1][0], "legal_ocr_service_fail")

    def test_revocation_at_finish_is_preserved_as_revocation(self):
        api = FakeApi()
        api.finish = {"job": {"id": ID, "state": "authorization_revoked"}, "version_id": None}
        self.assertEqual(self.run_one(api)["state"], "authorization_revoked")

    def test_lost_finish_is_not_retried_or_overwritten_by_fail(self):
        api = FakeApi()
        api.lose_finish = True
        with self.assertRaises(WorkerFailure):
            self.run_one(api)
        self.assertEqual([call[0] for call in api.calls], ["legal_ocr_service_claim", "download", "legal_ocr_service_finish"])

    def test_success_requires_a_persisted_version_and_matching_job_receipt(self):
        for receipt in ({"job": {"id": ID, "state": "succeeded"}, "version_id": None}, {"job": {"id": DOC, "state": "succeeded"}, "version_id": VERSION}):
            api = FakeApi()
            api.finish = receipt
            with self.assertRaises(WorkerFailure):
                self.run_one(api)
            self.assertEqual(api.calls[-1][0], "legal_ocr_service_finish")

    def test_timeout_and_shutdown_never_start_a_new_write_after_the_deadline(self):
        for code in ("worker_timeout", "worker_stopped"):
            api = FakeApi()
            def expire(*_args, **_kwargs):
                raise WorkerFailure(code)
            with self.assertRaises(WorkerFailure):
                self.run_one(api, expire)
            self.assertEqual([call[0] for call in api.calls], ["legal_ocr_service_claim", "download"])

    def test_real_alarm_interrupts_processing_and_preserves_unconfirmed_lease(self):
        api = FakeApi()
        previous = signal.getsignal(signal.SIGALRM)
        def expire(_signum, _frame):
            raise WorkerFailure("worker_timeout")
        signal.signal(signal.SIGALRM, expire)
        try:
            signal.setitimer(signal.ITIMER_REAL, 0.02)
            with self.assertRaises(WorkerFailure):
                self.run_one(api, lambda *_args, **_kwargs: time.sleep(0.1))
        finally:
            signal.setitimer(signal.ITIMER_REAL, 0)
            signal.signal(signal.SIGALRM, previous)
        self.assertEqual([call[0] for call in api.calls], ["legal_ocr_service_claim", "download"])

    def test_failure_requires_matching_receipt_and_retains_concurrent_revocation(self):
        for receipt in (None, {"id": DOC, "state": "failed"}, {"id": ID, "state": "authorization_revoked"}):
            api = FakeApi()
            api.bytes = b"changed source"
            original = api.rpc
            def rpc(name, payload):
                if name.endswith("fail"):
                    return receipt
                return original(name, payload)
            api.rpc = rpc
            if isinstance(receipt, dict) and receipt.get("id") == ID:
                self.assertEqual(self.run_one(api)["state"], "authorization_revoked")
            else:
                with self.assertRaises(WorkerFailure):
                    self.run_one(api)


if __name__ == "__main__":
    unittest.main()
