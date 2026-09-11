"""Private OCR queue consumer. HTTP exposes health only; documents never arrive by URL."""
from __future__ import annotations

import hashlib
import http.client
from http.server import BaseHTTPRequestHandler, HTTPServer
import json
import multiprocessing
import os
from pathlib import Path
import re
import signal
import socket
import ssl
import tempfile
import time
from urllib.parse import urlsplit

from ocr_kernel import Engines, Limits, process_file

UUID = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")
HASH = re.compile(r"^[0-9a-f]{64}$")
MAX_BYTES = 10 * 1024 * 1024


class WorkerFailure(Exception):
    def __init__(self, code: str):
        self.code = code
        super().__init__(code)


class PrivateApi:
    def __init__(self, base: str, key: str):
        parsed = urlsplit(base)
        if parsed.username or parsed.password or parsed.query or parsed.fragment or parsed.path not in ("", "/") or not parsed.hostname or not key or "\n" in key or "\r" in key:
            raise WorkerFailure("invalid_configuration")
        if parsed.scheme != "https" and not (parsed.scheme == "http" and parsed.hostname.endswith(".railway.internal")):
            raise WorkerFailure("invalid_configuration")
        self.base = parsed
        self.key = key

    def request(self, method: str, path: str, body: bytes | None, limit: int) -> bytes:
        # No redirects, proxies, arbitrary URLs, attachment links, or query strings.
        if not path.startswith("/") or "?" in path or "#" in path or ".." in path or "\\" in path:
            raise WorkerFailure("invalid_path")
        deadline = time.monotonic() + 12
        connection = (http.client.HTTPSConnection(self.base.hostname, self.base.port, timeout=5, context=ssl.create_default_context()) if self.base.scheme == "https" else http.client.HTTPConnection(self.base.hostname, self.base.port, timeout=5))
        headers = {"Authorization": "Bearer " + self.key, "apikey": self.key, "Accept-Encoding": "identity"}
        if body is not None:
            headers["Content-Type"] = "application/json"
        try:
            connection.request(method, path, body=body, headers=headers)
            response = connection.getresponse()
            if not 200 <= response.status < 300:
                raise WorkerFailure("service_unavailable")
            if response.getheader("Content-Encoding", "identity").lower() not in ("", "identity"):
                raise WorkerFailure("invalid_response")
            length = response.getheader("Content-Length")
            if length and (not length.isdigit() or int(length) > limit):
                raise WorkerFailure("response_limit")
            chunks = bytearray()
            while True:
                remaining = deadline - time.monotonic()
                if remaining <= 0:
                    raise WorkerFailure("network_timeout")
                if connection.sock:
                    connection.sock.settimeout(min(5, remaining))
                chunk = response.read1(min(65536, limit + 1 - len(chunks)))
                if not chunk:
                    break
                chunks.extend(chunk)
                if len(chunks) > limit:
                    raise WorkerFailure("response_limit")
            if length and len(chunks) != int(length):
                raise WorkerFailure("incomplete_response")
            return bytes(chunks)
        except (OSError, http.client.HTTPException, ValueError):
            raise WorkerFailure("network_unavailable") from None
        finally:
            connection.close()

    def rpc(self, name: str, payload: dict) -> object:
        if name not in ("legal_ocr_service_claim", "legal_ocr_service_finish", "legal_ocr_service_fail"):
            raise WorkerFailure("invalid_rpc")
        body = json.dumps(payload, ensure_ascii=False, allow_nan=False).encode()
        if len(body) > 4 * 1024 * 1024 + 4096:
            raise WorkerFailure("result_limit")
        raw = self.request("POST", "/rest/v1/rpc/" + name, body, 128 * 1024)
        try:
            return json.loads(raw)
        except (ValueError, UnicodeError):
            raise WorkerFailure("invalid_rpc_response") from None

    def download(self, storage_path: str) -> bytes:
        return self.request("GET", "/storage/v1/object/authenticated/legal-case-documents/" + storage_path, None, MAX_BYTES)


def validate_job(job: object) -> dict:
    if not isinstance(job, dict):
        raise WorkerFailure("invalid_job")
    for field in ("id", "lease_token", "document_id", "tenant_id", "case_id"):
        if not isinstance(job.get(field), str) or not UUID.fullmatch(job[field]):
            raise WorkerFailure("invalid_job")
    if job.get("category") not in ("general", "medical", "fiscal", "restricted") or job.get("mime_type") not in ("application/pdf", "image/png") or not isinstance(job.get("source_sha256"), str) or not HASH.fullmatch(job["source_sha256"]):
        raise WorkerFailure("invalid_job")
    if type(job.get("source_bytes")) is not int or not 1 <= job["source_bytes"] <= MAX_BYTES or type(job.get("max_pages")) is not int or not 1 <= job["max_pages"] <= 20:
        raise WorkerFailure("invalid_job")
    if job.get("storage_path") != "/".join(job[key] for key in ("tenant_id", "case_id", "document_id")):
        raise WorkerFailure("invalid_storage_path")
    return job


def consume_one(api: PrivateApi, engines: Engines, temp_parent: Path, processor=process_file) -> dict:
    # A lost claim/finish response is ambiguous. Never retry a write or overwrite its outcome.
    claimed = api.rpc("legal_ocr_service_claim", {"p_limit": 1})
    if not isinstance(claimed, list) or len(claimed) > 1:
        raise WorkerFailure("invalid_claim")
    if not claimed:
        return {"state": "idle", "processed": 0}
    job = validate_job(claimed[0])
    started = time.monotonic()
    processing_started = False
    try:
        data = api.download(job["storage_path"])
        if len(data) != job["source_bytes"] or hashlib.sha256(data).hexdigest() != job["source_sha256"]:
            raise WorkerFailure("source_mismatch")
        with tempfile.TemporaryDirectory(prefix="legal-ocr-job-", dir=temp_parent) as directory:
            work = Path(directory)
            work.chmod(0o700)
            source = work / "original"
            with source.open("xb") as stream:
                source.chmod(0o600)
                stream.write(data)
            processing_started = True
            result = processor(source, job["mime_type"], languages=["por"], engines=engines, limits=Limits(pages=job["max_pages"]), temp_parent=work)
        if not isinstance(result, dict) or result.get("source_sha256") != job["source_sha256"] or result.get("source_bytes") != job["source_bytes"] or result.get("mime_type") != job["mime_type"]:
            raise WorkerFailure("invalid_kernel_result")
        if len(json.dumps(result, ensure_ascii=False, allow_nan=False).encode()) > 4 * 1024 * 1024:
            raise WorkerFailure("result_limit")
    except Exception as error:
        code = error.code if isinstance(error, WorkerFailure) else "worker_failed"
        if code in ("worker_timeout", "worker_stopped"):
            # The one-shot alarm has fired or shutdown was requested. Do not start
            # a new network write outside that deadline; lease recovery keeps quota.
            raise
        # SQL accepts only current leases and preserves quota if processing may have begun.
        failed = api.rpc("legal_ocr_service_fail", {"p_job_id": job["id"], "p_lease_token": job["lease_token"], "p_code": code, "p_processing_started": processing_started})
        if not isinstance(failed, dict) or failed.get("id") != job["id"] or failed.get("state") not in ("failed", "cancelled", "authorization_revoked", "unknown"):
            raise WorkerFailure("unconfirmed_failure")
        return {"state": failed["state"], "processed": 1, "code": code, "duration_ms": round((time.monotonic() - started) * 1000)}
    outcome = api.rpc("legal_ocr_service_finish", {"p_job_id": job["id"], "p_lease_token": job["lease_token"], "p_result": result})
    if not isinstance(outcome, dict) or not isinstance(outcome.get("job"), dict) or outcome["job"].get("id") != job["id"] or outcome["job"].get("state") not in ("succeeded", "partial", "failed", "cancelled", "authorization_revoked", "unknown"):
        raise WorkerFailure("unconfirmed_finish")
    if outcome["job"]["state"] in ("succeeded", "partial") and (not isinstance(outcome.get("version_id"), str) or not UUID.fullmatch(outcome["version_id"])):
        raise WorkerFailure("unconfirmed_version")
    return {"state": outcome["job"]["state"], "processed": 1, "duration_ms": round((time.monotonic() - started) * 1000)}


def write_status(path: Path, state: dict) -> None:
    pending = path.with_suffix(".next")
    pending.write_text(json.dumps({"updated_at": time.time(), **state}))
    pending.chmod(0o600)
    pending.replace(path)


def serve_health(path: str, port: int) -> None:
    class Handler(BaseHTTPRequestHandler):
        def do_GET(self):
            if self.path != "/health":
                self.send_error(404)
                return
            try:
                state = json.loads(Path(path).read_text())
                ok = time.time() - state["updated_at"] < 240 and state.get("engines_ready") is True
            except (OSError, ValueError, KeyError):
                state, ok = {}, False
            body = json.dumps({"ok": ok, **state}).encode()
            self.send_response(200 if ok else 503)
            self.send_header("Content-Type", "application/json")
            self.send_header("Cache-Control", "no-store")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def log_message(self, *_args):
            pass

    class Server(HTTPServer):
        address_family = socket.AF_INET6
        def get_request(self):
            connection, address = super().get_request()
            connection.settimeout(2)
            return connection, address
    Server(("::", port), Handler).serve_forever()


def main() -> None:
    os.umask(0o077)
    tessdata = os.environ.get("LEGAL_OCR_TESSDATA_DIR", "/opt/legal-ocr/tessdata")
    engines = Engines.system(tessdata)
    if not (Path(tessdata) / "por.traineddata").is_file():
        raise WorkerFailure("language_unavailable")
    base, key = os.environ.get("LEGAL_OCR_SUPABASE_URL"), os.environ.get("LEGAL_OCR_SERVICE_ROLE_KEY")
    api = PrivateApi(base, key) if base and key else None
    stopped = False

    def stop(_signum, _frame):
        nonlocal stopped
        stopped = True
        raise WorkerFailure("worker_stopped")

    def expired(_signum, _frame):
        raise WorkerFailure("worker_timeout")

    with tempfile.TemporaryDirectory(prefix="legal-ocr-runtime-") as directory:
        root = Path(directory)
        root.chmod(0o700)
        status = root / "health.json"
        write_status(status, {"state": "starting", "engines_ready": True, "configured": api is not None})
        # Separate process: the OCR process remains single-threaded for POSIX limits/signals.
        health = multiprocessing.get_context("spawn").Process(target=serve_health, args=(str(status), int(os.environ.get("PORT", "8080"))), daemon=True)
        health.start()
        signal.signal(signal.SIGTERM, stop)
        signal.signal(signal.SIGINT, stop)
        signal.signal(signal.SIGALRM, expired)
        try:
            while not stopped:
                try:
                    signal.setitimer(signal.ITIMER_REAL, 150)
                    result = consume_one(api, engines, root) if api else {"state": "not_configured", "processed": 0}
                except Exception as error:
                    result = {"state": "unconfirmed", "code": error.code if isinstance(error, WorkerFailure) else "worker_failed", "processed": 0}
                finally:
                    signal.setitimer(signal.ITIMER_REAL, 0)
                write_status(status, {**result, "engines_ready": True, "configured": api is not None})
                if result.get("processed") or result.get("state") == "unconfirmed":
                    print(json.dumps({"worker": "legal-ocr", **result}), flush=True)
                if not stopped:
                    time.sleep(30)
        except WorkerFailure:
            pass
        finally:
            health.terminate()
            health.join(timeout=3)
            if health.is_alive():
                health.kill()


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(json.dumps({"worker": "legal-ocr", "state": "startup_failed", "code": exc.code if isinstance(exc, WorkerFailure) else "worker_failed"}), flush=True)
        raise SystemExit(1) from None
