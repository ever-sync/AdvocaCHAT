# syntax=docker/dockerfile:1.7
# Build context: repository root. Runtime cannot skip the verified test stage.
FROM python:3.12-slim-bookworm AS core

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PYTHONNOUSERSITE=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PIP_NO_CACHE_DIR=1 \
    LEGAL_OCR_TESSDATA_DIR=/opt/legal-ocr/tessdata

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates fonts-dejavu-core poppler-utils tesseract-ocr tini \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd --gid 10001 legal-ocr \
    && useradd --uid 10001 --gid 10001 --create-home --home-dir /home/legal-ocr --shell /usr/sbin/nologin legal-ocr \
    && chmod 0700 /home/legal-ocr

# Fixed official model; no build argument can substitute its origin or checksum.
RUN python - <<'PY'
import hashlib
import json
from pathlib import Path
import platform
import subprocess
import urllib.request

url = "https://raw.githubusercontent.com/tesseract-ocr/tessdata_fast/4.1.0/por.traineddata"
expected = "c4932b937207a9514b7514d518b931a99938c02a28a5a5a553f8599ed58b7deb"
with urllib.request.urlopen(url, timeout=20) as response:
    data = response.read(1_982_757)
if len(data) != 1_982_756 or hashlib.sha256(data).hexdigest() != expected:
    raise SystemExit("Official Portuguese model verification failed")
directory = Path("/opt/legal-ocr/tessdata")
directory.mkdir(parents=True, mode=0o755)
model = directory / "por.traineddata"
model.write_bytes(data)
model.chmod(0o444)
provenance = {
    "base": "python:3.12-slim-bookworm",
    "python": platform.python_version(),
    "tesseract": subprocess.check_output(["tesseract", "--version"], stderr=subprocess.STDOUT, timeout=5).decode().splitlines()[0],
    "poppler": subprocess.check_output(["pdfinfo", "-v"], stderr=subprocess.STDOUT, timeout=5).decode().splitlines()[0],
    "model": {"language": "por", "url": url, "sha256": expected, "bytes": len(data)},
}
manifest = directory.parent / "provenance.json"
manifest.write_text(json.dumps(provenance, sort_keys=True) + "\n", encoding="utf-8")
manifest.chmod(0o444)
PY

WORKDIR /app
COPY --chmod=0444 infra/legal-document-worker/ocr_kernel.py ./ocr_kernel.py

FROM core AS test
# Python fixture generators exist only in this stage. Rendering fonts stay in core.
COPY --chmod=0444 infra/legal-document-worker/requirements.test.txt ./requirements.test.txt
RUN python -m pip install --no-cache-dir --only-binary=:all: --timeout 20 --retries 1 -r requirements.test.txt
COPY --chmod=0444 infra/legal-document-worker/test_ocr_kernel.py ./test_ocr_kernel.py
COPY --chmod=0444 infra/legal-document-worker/worker.py ./worker.py
COPY --chmod=0444 infra/legal-document-worker/test_worker.py ./test_worker.py
ENV LEGAL_OCR_TEST_TESSDATA=/opt/legal-ocr/tessdata
USER 10001:10001

# RUN does not inherit ENTRYPOINT. Tini explicitly reaps killed descendants here.
# No credentials or network are available to the synthetic OCR acceptance suite.
RUN --network=none /usr/bin/tini -s -g -- python - <<'PY'
import hashlib
import json
import os
from pathlib import Path
import sys
import tempfile
import time
import unittest

import ocr_kernel
import test_ocr_kernel
import test_worker

if sys.platform != "linux" or os.geteuid() == 0:
    raise SystemExit("OCR verification requires non-root Linux")

original_process = ocr_kernel.process_file
observed_engines = []
def checked_process(*args, **kwargs):
    result = original_process(*args, **kwargs)
    if result["engine"]:
        if result["engine"].get("memory_enforcement") != "rlimit_as":
            raise AssertionError("Linux OCR did not enforce RLIMIT_AS")
        observed_engines.append(result["engine"])
    return result
ocr_kernel.process_file = checked_process

suite = unittest.defaultTestLoader.loadTestsFromModule(test_ocr_kernel)
if suite.countTestCases() != 10:
    raise SystemExit("Review the required OCR acceptance suite before changing its count")
outcome = unittest.TextTestRunner(verbosity=2).run(suite)
if not outcome.wasSuccessful() or outcome.testsRun != 10 or outcome.skipped or not observed_engines:
    raise SystemExit("OCR acceptance tests failed or were skipped")

worker_suite = unittest.defaultTestLoader.loadTestsFromModule(test_worker)
if worker_suite.countTestCases() < 10:
    raise SystemExit("The required worker transport tests are missing")
worker_outcome = unittest.TextTestRunner(verbosity=2).run(worker_suite)
if not worker_outcome.wasSuccessful() or worker_outcome.testsRun < 10 or worker_outcome.skipped:
    raise SystemExit("Worker transport tests failed or were skipped")

# Inspect the actual child limit as well as the returned provenance field.
with tempfile.TemporaryDirectory(prefix="ocr-linux-limit-") as temporary:
    output, _ = ocr_kernel._run(
        [sys.executable, "-c", "import resource;print(resource.getrlimit(resource.RLIMIT_AS)[0])"],
        Path(temporary), time.monotonic() + 5, ocr_kernel.Limits(), 4096,
    )
    if int(output.strip()) != ocr_kernel.Limits().memory_bytes:
        raise SystemExit("OCR child address-space limit differs from its policy")

verified = {
    "status": "verified", "tests": outcome.testsRun, "worker_tests": worker_outcome.testsRun,
    "uid": os.geteuid(),
    "memory_enforcement": "rlimit_as", "network": "none",
    "kernel_sha256": hashlib.sha256(Path("ocr_kernel.py").read_bytes()).hexdigest(),
    "tests_sha256": hashlib.sha256(Path("test_ocr_kernel.py").read_bytes()).hexdigest(),
    "worker_sha256": hashlib.sha256(Path("worker.py").read_bytes()).hexdigest(),
    "worker_tests_sha256": hashlib.sha256(Path("test_worker.py").read_bytes()).hexdigest(),
    "requirements_sha256": hashlib.sha256(Path("requirements.test.txt").read_bytes()).hexdigest(),
    "engine": json.loads(Path("/opt/legal-ocr/provenance.json").read_text()),
}
sentinel = Path("/tmp/ocr-verified")
sentinel.write_text(json.dumps(verified, sort_keys=True) + "\n", encoding="utf-8")
sentinel.chmod(0o444)
print(json.dumps(verified, sort_keys=True))
PY

FROM core AS runtime
# This dependency forces BuildKit to execute or reuse a successful test stage.
COPY --from=test --chmod=0444 /tmp/ocr-verified /opt/legal-ocr/ocr-verified
COPY --chmod=0444 infra/legal-document-worker/worker.py ./worker.py
ENV PORT=8080
USER 10001:10001
RUN --network=none python - <<'PY'
import hashlib
import importlib.util
import json
import os
from pathlib import Path

marker = json.loads(Path("/opt/legal-ocr/ocr-verified").read_text())
if os.geteuid() == 0 or marker.get("status") != "verified" or marker.get("tests") != 10 or marker.get("worker_tests", 0) < 10:
    raise SystemExit("Verified non-root OCR runtime required")
if marker.get("kernel_sha256") != hashlib.sha256(Path("ocr_kernel.py").read_bytes()).hexdigest():
    raise SystemExit("Runtime OCR kernel differs from the tested version")
if marker.get("worker_sha256") != hashlib.sha256(Path("worker.py").read_bytes()).hexdigest():
    raise SystemExit("Runtime worker differs from the tested version")
if any(importlib.util.find_spec(name) is not None for name in ("PIL", "pypdf", "reportlab", "charset_normalizer")):
    raise SystemExit("Fixture dependencies must not be present in the runtime")
PY
EXPOSE 8080
STOPSIGNAL SIGTERM
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
    CMD ["python", "-c", "import http.client,os; c=http.client.HTTPConnection('127.0.0.1',int(os.environ.get('PORT','8080')),timeout=2); c.request('GET','/health'); r=c.getresponse(); c.close(); raise SystemExit(0 if r.status==200 else 1)"]
ENTRYPOINT ["/usr/bin/tini", "-g", "--"]
CMD ["python", "worker.py"]
