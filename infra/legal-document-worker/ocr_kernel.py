"""Offline, bounded OCR kernel. No network, database, tenant inference or legal decisions.

Call only with a server-authorized file. Returned text/TSV is private and unreviewed.
The caller must revalidate source hash and authorization before persisting/publishing.
"""
from __future__ import annotations

import csv
import hashlib
import io
import json
import math
import os
from pathlib import Path
import re
import resource
import selectors
import shutil
import signal
import stat
import struct
import subprocess
import sys
import tempfile
import time
import zlib
from dataclasses import dataclass
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from typing import Sequence

KERNEL_VERSION = "legal-ocr-offline-v1"
TSV_COLUMNS = ["level", "page_num", "block_num", "par_num", "line_num", "word_num", "left", "top", "width", "height", "conf", "text"]


class OcrFailure(Exception):
    """A normalized code only: never propagate process output or document text."""
    def __init__(self, code: str):
        self.code = code
        super().__init__(code)


@dataclass(frozen=True)
class Limits:
    input_bytes: int = 10 * 1024 * 1024
    pages: int = 20
    pixels: int = 16_000_000
    dimension: int = 4000
    output_bytes: int = 4 * 1024 * 1024
    page_output_bytes: int = 512 * 1024
    words_per_page: int = 12000
    total_seconds: float = 90
    process_seconds: float = 12
    memory_bytes: int = 1536 * 1024 * 1024
    minimum_confidence: str = "60.00"

    def validate(self) -> None:
        integer_limits = {"input_bytes": 10 * 1024 * 1024, "pages": 50, "pixels": 16_000_000, "dimension": 4000, "output_bytes": 8 * 1024 * 1024, "page_output_bytes": 1024 * 1024, "words_per_page": 20000, "memory_bytes": 2 * 1024 * 1024 * 1024}
        if any(type(getattr(self, key)) is not int or not 1 <= getattr(self, key) <= maximum for key, maximum in integer_limits.items()):
            raise OcrFailure("invalid_limits")
        if self.output_bytes < 16384:
            raise OcrFailure("invalid_limits")
        if not 0 < self.total_seconds <= 180 or not 0 < self.process_seconds <= 30:
            raise OcrFailure("invalid_limits")
        try:
            if not Decimal(self.minimum_confidence).is_finite() or not 0 <= Decimal(self.minimum_confidence) <= 100:
                raise OcrFailure("invalid_limits")
        except InvalidOperation:
            raise OcrFailure("invalid_limits") from None


@dataclass(frozen=True)
class Engines:
    pdfinfo: str
    pdftoppm: str
    tesseract: str
    tessdata_dir: str

    @classmethod
    def system(cls, tessdata_dir: str) -> "Engines":
        found = [shutil.which(name) for name in ("pdfinfo", "pdftoppm", "tesseract")]
        if not all(found):
            raise OcrFailure("engine_unavailable")
        return cls(*found, tessdata_dir)  # type: ignore[arg-type]


def _kill_group(process: subprocess.Popen) -> None:
    try:
        os.killpg(process.pid, signal.SIGKILL)
    except ProcessLookupError:
        pass
    process.wait(timeout=3)


def _mac_group_memory(group: int) -> int:
    # Darwin does not implement the RLIMIT_AS/DATA ceiling used in the Linux worker.
    # Read numeric pgid/RSS only; never collect process commands or arguments.
    try:
        sample = subprocess.run(["/bin/ps", "-A", "-o", "pgid=", "-o", "rss="], stdin=subprocess.DEVNULL, capture_output=True, timeout=1, check=True)
        return sum(int(row.split()[1]) * 1024 for row in sample.stdout.splitlines() if len(row.split()) == 2 and int(row.split()[0]) == group)
    except (ValueError, OSError, subprocess.SubprocessError):
        raise OcrFailure("memory_monitor_unavailable") from None


def _run(argv: Sequence[str], cwd: Path, deadline: float, limits: Limits, max_output: int) -> tuple[bytes, bytes]:
    """Trusted executable + fixed arguments only. Bound both pipes, CPU, RAM and disk."""
    seconds = min(limits.process_seconds, deadline - time.monotonic())
    if seconds <= 0:
        raise OcrFailure("time_limit")

    def child_limits() -> None:
        os.umask(0o077)
        resource.setrlimit(resource.RLIMIT_CORE, (0, 0))
        if sys.platform != "darwin":
            resource.setrlimit(resource.RLIMIT_AS, (limits.memory_bytes, limits.memory_bytes))
        resource.setrlimit(resource.RLIMIT_FSIZE, (128 * 1024 * 1024, 128 * 1024 * 1024))
        resource.setrlimit(resource.RLIMIT_CPU, (max(1, math.ceil(seconds)), max(2, math.ceil(seconds) + 1)))
        resource.setrlimit(resource.RLIMIT_NOFILE, (64, 64))

    clean_env = {"PATH": "/usr/bin:/bin", "LC_ALL": "C", "LANG": "C", "TMPDIR": str(cwd), "OMP_THREAD_LIMIT": "1", "OPENBLAS_NUM_THREADS": "1"}
    try:
        process = subprocess.Popen(list(argv), cwd=cwd, stdin=subprocess.DEVNULL, stdout=subprocess.PIPE, stderr=subprocess.PIPE, shell=False, start_new_session=True, close_fds=True, env=clean_env, preexec_fn=child_limits)
    except (OSError, subprocess.SubprocessError):
        raise OcrFailure("engine_unavailable") from None
    selector = selectors.DefaultSelector()
    streams = {"stdout": bytearray(), "stderr": bytearray()}
    expires = min(deadline, time.monotonic() + seconds)
    try:
        for name in streams:
            pipe = getattr(process, name)
            os.set_blocking(pipe.fileno(), False)
            selector.register(pipe, selectors.EVENT_READ, name)
        while selector.get_map():
            remaining = expires - time.monotonic()
            if remaining <= 0:
                raise OcrFailure("time_limit")
            if sys.platform == "darwin" and _mac_group_memory(process.pid) > limits.memory_bytes:
                raise OcrFailure("memory_limit")
            for key, _ in selector.select(min(remaining, 0.1)):
                chunk = os.read(key.fd, 65536)
                if not chunk:
                    selector.unregister(key.fileobj)
                    continue
                streams[key.data].extend(chunk)
                if len(streams["stdout"]) + len(streams["stderr"]) > max_output:
                    raise OcrFailure("output_limit")
        process.wait(timeout=max(0.001, expires - time.monotonic()))
        if process.returncode != 0:
            # Only classify known diagnostics internally; never include them in output.
            if b"password" in streams["stderr"].lower() or b"encrypted" in streams["stderr"].lower():
                raise OcrFailure("encrypted_pdf")
            raise OcrFailure("engine_failed")
        return bytes(streams["stdout"]), bytes(streams["stderr"])
    except subprocess.TimeoutExpired:
        raise OcrFailure("time_limit") from None
    finally:
        # Also kill descendants that outlive an otherwise successful parent.
        _kill_group(process)
        selector.close()
        process.stdout.close()
        process.stderr.close()


def _private_source(path: Path, destination: Path, limit: int) -> tuple[bytes, str]:
    try:
        fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
        with os.fdopen(fd, "rb") as stream:
            info = os.fstat(stream.fileno())
            if not stat.S_ISREG(info.st_mode):
                raise OcrFailure("not_regular_file")
            if not 1 <= info.st_size <= limit:
                raise OcrFailure("input_limit")
            data = stream.read(limit + 1)
        if len(data) > limit:
            raise OcrFailure("input_limit")
        with destination.open("xb") as output:
            os.chmod(destination, 0o600)
            output.write(data)
        return data, hashlib.sha256(data).hexdigest()
    except OcrFailure:
        raise
    except OSError:
        raise OcrFailure("source_unavailable") from None


def _png_dimensions(data: bytes, limits: Limits) -> tuple[int, int]:
    if len(data) < 33 or data[:8] != b"\x89PNG\r\n\x1a\n" or data[12:16] != b"IHDR" or data[8:12] != b"\x00\x00\x00\r":
        raise OcrFailure("invalid_png")
    width, height = struct.unpack(">II", data[16:24])
    if not width or not height or width > limits.dimension or height > limits.dimension or width * height > limits.pixels:
        raise OcrFailure("pixel_limit")
    offset = 8
    while offset + 12 <= len(data):
        length = struct.unpack(">I", data[offset:offset + 4])[0]
        kind = data[offset + 4:offset + 8]
        end = offset + 12 + length
        if end > len(data) or zlib.crc32(data[offset + 4:end - 4]) & 0xffffffff != struct.unpack(">I", data[end - 4:end])[0]:
            raise OcrFailure("invalid_png")
        if kind in (b"acTL", b"fcTL", b"fdAT"):
            raise OcrFailure("animated_image_unsupported")
        if kind == b"IEND":
            if end != len(data):
                raise OcrFailure("invalid_png")
            return width, height
        offset = end
    raise OcrFailure("invalid_png")


def _tsv_page(tsv: bytes, number: int, width: int, height: int, limits: Limits) -> dict:
    try:
        raw = tsv.decode("utf-8", errors="strict")
        reader = csv.DictReader(io.StringIO(raw), delimiter="\t", quoting=csv.QUOTE_NONE)
        if reader.fieldnames != TSV_COLUMNS:
            raise OcrFailure("invalid_tsv")
        words, lines = [], {}
        for row in reader:
            if None in row or any(row.get(key) is None for key in TSV_COLUMNS):
                raise OcrFailure("invalid_tsv")
            if row.get("level") != "5" or not row["text"].strip():
                continue
            left, top, box_width, box_height = [int(row[key]) for key in ("left", "top", "width", "height")]
            confidence = Decimal(row["conf"])
            if row["page_num"] != "1" or not confidence.is_finite() or not 0 <= confidence <= 100 or min(left, top, box_width, box_height) < 0 or left + box_width > width or top + box_height > height:
                raise OcrFailure("invalid_tsv")
            text = row["text"]
            if any(ord(char) < 32 for char in text) or len(text) > 10000:
                raise OcrFailure("invalid_tsv")
            word = {"text": text, "left": left, "top": top, "width": box_width, "height": box_height, "confidence": str(confidence), "block": int(row["block_num"]), "paragraph": int(row["par_num"]), "line": int(row["line_num"])}
            words.append(word)
            if len(words) > limits.words_per_page:
                raise OcrFailure("output_limit")
            line_key = (word["block"], word["paragraph"], word["line"])
            lines.setdefault(line_key, []).append(text)
        mean = sum((Decimal(word["confidence"]) for word in words), Decimal(0)) / len(words) if words else None
        state = "no_text_recognized" if not words else "low_confidence" if mean < Decimal(limits.minimum_confidence) else "recognized"
        return {"page": number, "status": state, "text": "\n".join(" ".join(line) for line in lines.values()), "words": words, "tsv": raw, "confidence_mean": str(mean.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)) if mean is not None else None, "width": width, "height": height, "coordinate_system": "rendered_pixels", "review_status": "unreviewed"}
    except (ValueError, InvalidOperation, csv.Error, UnicodeError):
        raise OcrFailure("invalid_tsv") from None


def process_file(path: str | Path, mime_type: str, *, languages: Sequence[str], engines: Engines, limits: Limits = Limits(), temp_parent: str | Path | None = None) -> dict:
    """Return private unreviewed pages or explicit refusal; input is never executed."""
    limits.validate()
    started = time.monotonic()
    deadline = started + limits.total_seconds
    result = {"kernel_version": KERNEL_VERSION, "source_sha256": None, "source_bytes": None, "mime_type": mime_type, "status": "refused", "reason": None, "pages_total": None, "pages": [], "engine": {}, "review_status": "unreviewed"}
    try:
        if mime_type not in ("application/pdf", "image/png"):
            raise OcrFailure("unsupported_media")
        if not languages or len(languages) > 3 or len(set(languages)) != len(languages) or any(not re.fullmatch(r"[a-z]{3}", language) for language in languages):
            raise OcrFailure("explicit_languages_required")
        with tempfile.TemporaryDirectory(prefix="legal-ocr-", dir=temp_parent) as directory:
            work = Path(directory)
            os.chmod(work, 0o700)
            source = work / ("source.pdf" if mime_type == "application/pdf" else "source.png")
            original, source_hash = _private_source(Path(path), source, limits.input_bytes)
            result.update(source_sha256=source_hash, source_bytes=len(original))
            if mime_type == "application/pdf" and not original.startswith(b"%PDF-"):
                raise OcrFailure("invalid_pdf")
            if mime_type == "image/png":
                _png_dimensions(original, limits)
            models = []
            for language in languages:
                model = Path(engines.tessdata_dir) / f"{language}.traineddata"
                if not model.is_file() or model.is_symlink() or not 1 <= model.stat().st_size <= 100 * 1024 * 1024:
                    raise OcrFailure("language_unavailable")
                digest = hashlib.sha256()
                with model.open("rb") as stream:
                    for chunk in iter(lambda: stream.read(1024 * 1024), b""):
                        digest.update(chunk)
                models.append({"language": language, "sha256": digest.hexdigest()})
            version, _ = _run([engines.tesseract, "--version"], work, deadline, limits, 32768)
            result["engine"] = {"tesseract": version.decode("utf-8", errors="replace").splitlines()[0][:160], "models": models, "oem": 1, "psm": 3, "render_dpi": 150, "render_max_dimension": limits.dimension, "minimum_confidence": limits.minimum_confidence, "memory_enforcement": "rss_process_group_monitor" if sys.platform == "darwin" else "rlimit_as"}
            count = 1
            if mime_type == "application/pdf":
                poppler_out, poppler_err = _run([engines.pdfinfo, "-v"], work, deadline, limits, 32768)
                result["engine"]["poppler"] = (poppler_out or poppler_err).decode("utf-8", errors="replace").splitlines()[0][:160]
                info, _ = _run([engines.pdfinfo, str(source)], work, deadline, limits, 32768)
                if re.search(rb"^Encrypted:\s+yes", info, re.MULTILINE):
                    raise OcrFailure("encrypted_pdf")
                match = re.search(rb"^Pages:\s+(\d+)\s*$", info, re.MULTILINE)
                if not match:
                    raise OcrFailure("invalid_pdf")
                count = int(match.group(1))
                result["pages_total"] = count
                if not 1 <= count <= limits.pages:
                    raise OcrFailure("page_limit")
            result["pages_total"] = count
            for number in range(1, count + 1):
                try:
                    if time.monotonic() >= deadline:
                        raise OcrFailure("time_limit")
                    raster = source
                    if mime_type == "application/pdf":
                        prefix = work / "page"
                        _run([engines.pdftoppm, "-f", str(number), "-l", str(number), "-r", "150", "-scale-to", str(limits.dimension), "-singlefile", "-png", str(source), str(prefix)], work, deadline, limits, 32768)
                        raster = work / "page.png"
                    if raster.stat().st_size > 64 * 1024 * 1024:
                        raise OcrFailure("pixel_limit")
                    width, height = _png_dimensions(raster.read_bytes(), limits)
                    output, _ = _run([engines.tesseract, str(raster), "stdout", "--tessdata-dir", str(Path(engines.tessdata_dir).resolve()), "-l", "+".join(languages), "--oem", "1", "--psm", "3", "-c", "tessedit_create_tsv=1", "-c", "tessedit_create_txt=0"], work, deadline, limits, limits.page_output_bytes)
                    page = _tsv_page(output, number, width, height, limits)
                    if len(json.dumps(result, ensure_ascii=False).encode()) + len(json.dumps(page, ensure_ascii=False).encode()) > limits.output_bytes:
                        raise OcrFailure("output_limit")
                    result["pages"].append(page)
                except OcrFailure as error:
                    result["pages"].append({"page": number, "status": "not_processed", "reason": error.code, "review_status": "unreviewed"})
                except OSError:
                    result["pages"].append({"page": number, "status": "not_processed", "reason": "engine_failed", "review_status": "unreviewed"})
                finally:
                    if mime_type == "application/pdf":
                        (work / "page.png").unlink(missing_ok=True)
            states = [page["status"] for page in result["pages"]]
            result["status"] = "complete" if all(state == "recognized" for state in states) else "partial" if any(state in ("recognized", "low_confidence") for state in states) else "unreadable" if all(state == "no_text_recognized" for state in states) else "failed"
            if result["status"] == "failed":
                result["reason"] = next((page.get("reason") for page in result["pages"] if page.get("reason")), "processing_failed")
    except OcrFailure as error:
        result["reason"] = error.code
    except (OSError, ValueError, IndexError):
        result["reason"] = "processing_failed"
    result["elapsed_ms"] = round((time.monotonic() - started) * 1000)
    return result


def safe_summary(result: dict) -> dict:
    """Suitable for test/status logs: excludes paths, text, words, TSV and filenames."""
    return {key: result.get(key) for key in ("kernel_version", "source_sha256", "source_bytes", "mime_type", "status", "reason", "pages_total", "elapsed_ms")} | {"page_states": [{key: page[key] for key in ("page", "status", "reason") if key in page} for page in result.get("pages", [])]}
