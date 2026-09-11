"""Local SQL -> worker -> real offline OCR -> SQL integration, synthetic data only.

Prerequisite: create disposable database advocachat_f7_ocr_adapter by cloning the
schema-only F7 database with migrations through 2500. This script refuses any
other host, port or database; it never uses HTTP, Storage servers or providers.
Needs psql, Pillow, ReportLab, Poppler, Tesseract and explicit Portuguese tessdata.
Run from the repository root with LEGAL_OCR_TEST_TESSDATA configured.
"""
from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import uuid
from unittest import mock

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "infra/legal-document-worker"))
import ocr_kernel  # noqa: E402
from ocr_kernel import Engines, OcrFailure, process_file  # noqa: E402
from worker import consume_one, WorkerFailure  # noqa: E402
from test_ocr_kernel import OfflineOcrTests  # noqa: E402

PSQL = ["psql", "-h", "127.0.0.1", "-p", "55432", "-U", "postgres", "-d", "advocachat_f7_ocr_adapter", "-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-v", "VERBOSITY=verbose"]


def literal(value):
    if value is None:
        return "null"
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, int):
        return str(value)
    if isinstance(value, (dict, list)):
        value = json.dumps(value, ensure_ascii=False, allow_nan=False)
    return "'" + str(value).replace("'", "''") + "'"


def execute(sql):
    result = subprocess.run(PSQL, input=sql, text=True, capture_output=True, timeout=20)
    if result.returncode:
        raise AssertionError(result.stderr.strip())
    rows = [line for line in result.stdout.splitlines() if line.strip()]
    return rows[-1] if rows else None


def scalar(expression, *, actor=None, role="postgres"):
    if role not in ("postgres", "authenticated", "service_role"):
        raise ValueError("Fixed local fixture roles only")
    claims = {"role": role, **({"sub": actor} if actor else {})}
    raw = execute("begin; set local role " + role + "; set local request.jwt.claim.role=" + literal(role)
                  + "; set local request.jwt.claim.sub=" + literal(actor or "")
                  + "; set local request.jwt.claims=" + literal(claims)
                  + "; select to_jsonb(" + expression + ")::text; commit;")
    return json.loads(raw) if raw else None


def rpc(name, payload, *, actor=None, role="authenticated"):
    if not name.replace("_", "").isalnum() or any(not key.replace("_", "").isalnum() for key in payload):
        raise ValueError("Invalid fixture RPC identifier")
    args = ",".join(key + "=>" + literal(value) for key, value in payload.items())
    return scalar("public." + name + "(" + args + ")", actor=actor, role=role)


def denied(operation):
    try:
        operation()
    except AssertionError as error:
        if "42501" in str(error):
            return
        raise
    raise AssertionError("Expected SQLSTATE 42501 from the actual permission boundary")


def setup_fixture():
    if scalar("to_regclass('public.legal_ocr_adapter_fixture_ids')") is None:
        fixture = (ROOT / "supabase/tests/legal_assisted_deadlines.sql").read_text()
        marker = "\nreset role;\ninsert into legal_test_ids(name) values('deadline_proceeding'"
        if fixture.count(marker) != 1:
            raise AssertionError("Review the synthetic prerequisite fixture marker")
        execute(fixture.split(marker, 1)[0] + "\nreset role; create table public.legal_ocr_adapter_fixture_ids as select * from legal_test_ids; commit;\n")
    return scalar("(select jsonb_object_agg(name,id) from public.legal_ocr_adapter_fixture_ids)")


class SqlApi:
    """The production worker's narrow API, backed by real local RPCs and fake blobs."""
    def __init__(self, blobs, before_finish=None):
        self.blobs = blobs
        self.before_finish = before_finish
        self.result = None
        self.receipt = None
        self.claim = None

    def rpc(self, name, payload):
        if name not in ("legal_ocr_service_claim", "legal_ocr_service_finish", "legal_ocr_service_fail"):
            raise AssertionError("Worker attempted an unrelated RPC")
        if name == "legal_ocr_service_finish":
            self.result = payload["p_result"]
            if self.before_finish:
                self.before_finish()
        answer = rpc(name, payload, role="service_role")
        if name == "legal_ocr_service_claim":
            self.claim = answer
        if name in ("legal_ocr_service_finish", "legal_ocr_service_fail"):
            self.receipt = answer
        return answer

    def download(self, path):
        if path not in self.blobs:
            raise WorkerFailure("synthetic_blob_unavailable")
        return self.blobs[path]


def run():
    if not os.environ.get("LEGAL_OCR_TEST_TESSDATA"):
        raise AssertionError("Explicit Portuguese model directory required")
    ids = setup_fixture()
    owner, member, case_id = (ids[name] for name in ("owner", "member", "case"))
    rpc("legal_assistance_configure_ocr", {"p_enabled": True, "p_monthly_page_limit": 1000, "p_max_pages": 20}, actor=owner)
    rpc("legal_set_case_member", {"p_case_id": case_id, "p_profile_id": member, "p_can_edit": True, "p_can_view_medical": True, "p_can_view_fiscal": True}, actor=owner)
    engines = Engines.system(os.environ["LEGAL_OCR_TEST_TESSDATA"])
    blobs = {}
    checks = []
    denied(lambda: rpc("legal_ocr_service_claim", {"p_limit": 1}, actor=member))
    denied(lambda: scalar("(select count(*) from public.legal_document_text_pages)", actor=member, role="authenticated"))
    checks.append("browser_denied_private_service_and_text_table")

    def document(path, mime="image/png", category="medical"):
        data = path.read_bytes()
        prepared = rpc("legal_prepare_document", {"p_case_id": case_id, "p_category": category, "p_display_name": "Synthetic OCR integration", "p_file_name": "synthetic.png" if mime == "image/png" else "synthetic.pdf", "p_mime_type": mime, "p_size_bytes": len(data)}, actor=owner)
        execute("insert into storage.objects(bucket_id,name,metadata) values('legal-case-documents'," + literal(prepared["storage_path"]) + "," + literal({"size": len(data)}) + ");")
        rpc("legal_finalize_document", {"p_document_id": prepared["id"], "p_sha256": hashlib.sha256(data).hexdigest()}, role="service_role")
        blobs[prepared["storage_path"]] = data
        job = rpc("legal_ocr_enqueue", {"p_document_id": prepared["id"], "p_idempotency_key": str(uuid.uuid4())}, actor=member)
        return prepared, job

    OfflineOcrTests.setUpClass()
    fixture = OfflineOcrTests()
    fixture.setUp()
    try:
        for kind in ("png", "pdf", "partial", "unprocessed"):
            path = fixture.image() if kind == "png" else fixture.pdf(name=kind + ".pdf", second_page=False if kind == "partial" else True if kind == "unprocessed" else None)
            doc, job = document(path, "image/png" if kind == "png" else "application/pdf")
            api = SqlApi(blobs)
            def processor(*args, **kwargs):
                original_run = ocr_kernel._run
                def interrupted_second_page(argv, *rest):
                    if argv[0] == engines.pdftoppm and argv[argv.index("-f") + 1] == "2":
                        raise OcrFailure("time_limit")
                    return original_run(argv, *rest)
                if kind == "unprocessed":
                    with mock.patch.object(ocr_kernel, "_run", interrupted_second_page):
                        return process_file(*args, **kwargs)
                return process_file(*args, **kwargs)
            with tempfile.TemporaryDirectory(prefix="ocr-sql-integration-") as work:
                output = consume_one(api, engines, Path(work), processor)
                assert list(Path(work).iterdir()) == []
            assert output["state"] == ("partial" if kind in ("partial", "unprocessed") else "succeeded"), output
            version_id = api.receipt["version_id"]
            assert api.claim[0]["id"] == job["id"]
            page = rpc("legal_text_read_page", {"p_version_id": version_id, "p_page_number": 1}, actor=member)
            assert "1.234,56" in page["page"]["text"] and "10/09/2026" in page["page"]["text"]
            assert page["page"]["review_state"] == "unreviewed"
            assert page["version"]["state"] == "draft"
            assert page["version"]["source_sha256"] == api.result["source_sha256"]
            assert page["version"]["completeness"] == ("partial" if kind in ("partial", "unprocessed") else "complete")
            if kind in ("partial", "unprocessed"):
                second = rpc("legal_text_read_page", {"p_version_id": version_id, "p_page_number": 2}, actor=member)
                assert second["page"]["page_status"] == ("not_processed" if kind == "unprocessed" else "no_text_recognized")
                assert second["page"]["confidence_mean"] is None
                if kind == "unprocessed":
                    assert second["page"]["text"] is None
                    assert api.receipt["job"]["processed_pages"] == 1
                    assert api.receipt["job"]["quota_pages"] == 2
            if kind == "png":
                for actor in (ids["finance"], ids["outsider"], ids["same_admin"]):
                    denied(lambda: rpc("legal_text_read_page", {"p_version_id": version_id, "p_page_number": 1}, actor=actor))
                rpc("legal_set_case_member", {"p_case_id": case_id, "p_profile_id": member, "p_can_edit": True, "p_can_view_medical": False, "p_can_view_fiscal": True}, actor=owner)
                denied(lambda: rpc("legal_text_read_page", {"p_version_id": version_id, "p_page_number": 1}, actor=member))
                rpc("legal_set_case_member", {"p_case_id": case_id, "p_profile_id": member, "p_can_edit": True, "p_can_view_medical": True, "p_can_view_fiscal": True}, actor=owner)
                checks.append("text_read_revalidates_tenant_case_and_medical_grant")
            checks.append(kind + "_actual_kernel_persisted_unreviewed")

        for scenario in ("revoked", "cancelled", "hash_changed"):
            doc, job = document(fixture.image(name=scenario + ".png"))
            def before_finish():
                if scenario == "revoked":
                    rpc("legal_set_case_member", {"p_case_id": case_id, "p_profile_id": member, "p_can_edit": True, "p_can_view_medical": False, "p_can_view_fiscal": True}, actor=owner)
                elif scenario == "cancelled":
                    rpc("legal_ocr_cancel", {"p_job_id": job["id"], "p_note": "Synthetic cancellation after processing"}, actor=owner)
                else:
                    execute("update public.legal_case_documents set sha256=repeat('a',64) where id=" + literal(doc["id"]) + ";")
            api = SqlApi(blobs, before_finish)
            with tempfile.TemporaryDirectory(prefix="ocr-sql-revocation-") as work:
                output = consume_one(api, engines, Path(work))
                assert list(Path(work).iterdir()) == []
            assert output["state"] == ("cancelled" if scenario == "cancelled" else "authorization_revoked"), output
            assert api.receipt["version_id"] is None
            assert scalar("(select count(*) from public.legal_document_text_versions where document_id=" + literal(doc["id"]) + ")") == 0
            assert api.receipt["job"]["processed_pages"] == 1
            assert api.receipt["job"]["quota_pages"] == 1
            rpc("legal_set_case_member", {"p_case_id": case_id, "p_profile_id": member, "p_can_edit": True, "p_can_view_medical": True, "p_can_view_fiscal": True}, actor=owner)
            checks.append(scenario + "_no_content_persisted")
    finally:
        fixture.tearDown()
    print(json.dumps({"database": "advocachat_f7_ocr_adapter", "status": "PASS", "checks": checks, "external_http_calls": 0, "source_data": "synthetic"}))


if __name__ == "__main__":
    run()
