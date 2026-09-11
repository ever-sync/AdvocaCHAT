"""Synthetic offline acceptance tests. No client data, provider or network access."""
import hashlib
import json
import os
from pathlib import Path
import sys
import tempfile
import time
import unittest
from unittest import mock

from PIL import Image, ImageDraw, ImageFont
from pypdf import PdfReader, PdfWriter
from reportlab.pdfgen import canvas

import ocr_kernel as kernel


class OfflineOcrTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        directory = os.environ.get("LEGAL_OCR_TEST_TESSDATA")
        if not directory:
            raise RuntimeError("Explicit LEGAL_OCR_TEST_TESSDATA with official por.traineddata is required; no language fallback")
        cls.engines = kernel.Engines.system(directory)

    def setUp(self):
        self.directory = tempfile.TemporaryDirectory(prefix="ocr-synthetic-tests-")
        self.root = Path(self.directory.name)
        self.work = self.root / "private"
        self.work.mkdir(mode=0o700)

    def tearDown(self):
        self.directory.cleanup()

    def image(self, name="synthetic.png", blank=False):
        path = self.root / name
        picture = Image.new("RGB", (1600, 1000), "white")
        if not blank:
            fonts = [Path("/System/Library/Fonts/Supplemental/Arial.ttf"), Path("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf")]
            font_path = next((font for font in fonts if font.is_file()), None)
            if font_path is None:
                raise RuntimeError("Synthetic OCR fixture requires Arial or DejaVuSans")
            font = ImageFont.truetype(str(font_path), 58)
            draw = ImageDraw.Draw(picture)
            for index, text in enumerate(["DOCUMENTO SINTETICO", "Rendimento: R$ 1.234,56", "Data: 10/09/2026", "Conferência humana obrigatória"]):
                draw.text((100, 100 + index * 150), text, fill="black", font=font)
        picture.save(path)
        return path

    def pdf(self, name="synthetic.pdf", second_page=None):
        path = self.root / name
        pdf = canvas.Canvas(str(path), pagesize=(600, 800))
        pdf.setTitle("Synthetic OCR acceptance fixture")
        pdf.setFont("Helvetica", 24)
        for index, text in enumerate(["DOCUMENTO SINTETICO", "Rendimento: R$ 1.234,56", "Data: 10/09/2026", "Conferência humana obrigatória"]):
            pdf.drawString(50, 700 - index * 65, text)
        pdf.showPage()
        if second_page is not None:
            if second_page:
                pdf.setFont("Helvetica", 24)
                pdf.drawString(50, 700, "SEGUNDA PAGINA SINTETICA")
            pdf.showPage()
        pdf.save()
        return path

    def process(self, path, mime, **options):
        return kernel.process_file(path, mime, languages=["por"], engines=self.engines, temp_parent=self.work, **options)

    def test_real_portuguese_png_has_exact_values_hash_words_and_model_provenance(self):
        path = self.image()
        result = self.process(path, "image/png")
        self.assertEqual(result["status"], "complete", kernel.safe_summary(result))
        page = result["pages"][0]
        self.assertIn("1.234,56", page["text"])
        self.assertIn("10/09/2026", page["text"])
        self.assertTrue(page["words"])
        self.assertTrue(page["tsv"].startswith("level\tpage_num"))
        self.assertEqual(page["review_status"], "unreviewed")
        self.assertEqual(result["source_sha256"], hashlib.sha256(path.read_bytes()).hexdigest())
        self.assertEqual(result["engine"]["models"][0]["sha256"], hashlib.sha256((Path(self.engines.tessdata_dir) / "por.traineddata").read_bytes()).hexdigest())
        self.assertEqual(list(self.work.iterdir()), [])
        self.assertNotIn("1.234,56", json.dumps(kernel.safe_summary(result)))

    def test_real_pdf_rendering_then_ocr_preserves_page_and_values(self):
        result = self.process(self.pdf(), "application/pdf")
        self.assertEqual(result["status"], "complete", kernel.safe_summary(result))
        self.assertEqual(result["pages_total"], 1)
        self.assertIn("1.234,56", result["pages"][0]["text"])
        self.assertIn("10/09/2026", result["pages"][0]["text"])
        self.assertEqual(result["pages"][0]["coordinate_system"], "rendered_pixels")
        self.assertTrue(result["engine"]["poppler"].startswith("pdfinfo version"))

    def test_blank_page_is_unrecognized_and_two_page_document_is_explicitly_partial(self):
        result = self.process(self.pdf(second_page=False), "application/pdf")
        self.assertEqual(result["status"], "partial", kernel.safe_summary(result))
        self.assertEqual([p["status"] for p in result["pages"]], ["recognized", "no_text_recognized"])
        self.assertIsNone(result["pages"][1]["confidence_mean"])
        self.assertEqual(result["pages"][1]["words"], [])

    def test_encrypted_pdf_is_refused_without_attempting_a_password(self):
        original = self.pdf()
        writer = PdfWriter()
        writer.append_pages_from_reader(PdfReader(original))
        writer.encrypt("synthetic-password")
        protected = self.root / "encrypted.pdf"
        with protected.open("wb") as output:
            writer.write(output)
        result = self.process(protected, "application/pdf")
        self.assertEqual((result["status"], result["reason"]), ("refused", "encrypted_pdf"))
        self.assertEqual(result["pages"], [])
        self.assertEqual(list(self.work.iterdir()), [])

    def test_missing_language_never_silently_uses_english(self):
        result = kernel.process_file(self.image(), "image/png", languages=["zzz"], engines=self.engines, temp_parent=self.work)
        self.assertEqual(result["reason"], "language_unavailable")
        self.assertEqual(result["pages"], [])

    def test_byte_page_pixel_and_tsv_output_limits_are_explicit(self):
        self.assertEqual(self.process(self.image(), "image/png", limits=kernel.Limits(input_bytes=10))["reason"], "input_limit")
        limited = self.process(self.pdf(second_page=True), "application/pdf", limits=kernel.Limits(pages=1))
        self.assertEqual(limited["reason"], "page_limit")
        self.assertEqual(limited["pages_total"], 2)
        limited = self.process(self.image(), "image/png", limits=kernel.Limits(pixels=100))
        self.assertEqual(limited["reason"], "pixel_limit")
        limited = self.process(self.image(), "image/png", limits=kernel.Limits(page_output_bytes=100))
        self.assertEqual(limited["status"], "failed")
        self.assertEqual(limited["pages"][0]["reason"], "output_limit")

    def test_source_symlink_and_wrong_media_are_rejected_and_cleanup_remains_private(self):
        path = self.image()
        symlink = self.root / "untrusted.png"
        symlink.symlink_to(path)
        self.assertEqual(self.process(symlink, "image/png")["reason"], "source_unavailable")
        self.assertEqual(self.process(path, "application/pdf")["reason"], "invalid_pdf")
        original = kernel._run
        permissions = []
        def observe(argv, cwd, *args):
            permissions.append(cwd.stat().st_mode & 0o777)
            self.assertTrue(all((file.stat().st_mode & 0o077) == 0 for file in cwd.iterdir()))
            return original(argv, cwd, *args)
        with mock.patch.object(kernel, "_run", observe):
            result = self.process(path, "image/png")
        self.assertEqual(result["status"], "complete")
        self.assertTrue(permissions and all(mode == 0o700 for mode in permissions))

    def test_partial_failure_never_relabels_an_unprocessed_page_as_empty(self):
        original = kernel._run
        def fail_second(argv, *args):
            if argv[0] == self.engines.pdftoppm and argv[argv.index("-f") + 1] == "2":
                raise kernel.OcrFailure("time_limit")
            return original(argv, *args)
        with mock.patch.object(kernel, "_run", fail_second):
            result = self.process(self.pdf(second_page=True), "application/pdf")
        self.assertEqual(result["status"], "partial")
        self.assertEqual(result["pages"][1], {"page": 2, "status": "not_processed", "reason": "time_limit", "review_status": "unreviewed"})
        self.assertEqual(list(self.work.iterdir()), [])

    def test_process_timeout_kills_descendants_and_bounds_output(self):
        script = self.root / "timeout.py"
        script.write_text("import subprocess,sys,time,pathlib\np=subprocess.Popen([sys.executable,'-c','import time;time.sleep(30)'])\npathlib.Path('child.pid').write_text(str(p.pid))\ntime.sleep(30)\n")
        with self.assertRaisesRegex(kernel.OcrFailure, "time_limit"):
            kernel._run([sys.executable, str(script)], self.work, time.monotonic() + 0.4, kernel.Limits(process_seconds=0.4), 1000)
        child = int((self.work / "child.pid").read_text())
        gone = False
        for _ in range(20):
            try:
                os.kill(child, 0)
            except ProcessLookupError:
                gone = True
                break
            time.sleep(0.05)
        self.assertTrue(gone, "OCR child process survived the bounded process group")
        with self.assertRaisesRegex(kernel.OcrFailure, "output_limit"):
            kernel._run([sys.executable, "-c", "print('x'*100000)"], self.work, time.monotonic() + 2, kernel.Limits(), 100)

    def test_tsv_rejects_bad_coordinates_confidence_and_missing_columns(self):
        header = "\t".join(kernel.TSV_COLUMNS) + "\n"
        for row in ["5\t1\t1\t1\t1\t1\t99\t0\t2\t2\t90\ttext\n", "5\t1\t1\t1\t1\t1\t0\t0\t2\t2\tNaN\ttext\n", "5\t1\t1\n"]:
            with self.assertRaisesRegex(kernel.OcrFailure, "invalid_tsv"):
                kernel._tsv_page((header + row).encode(), 1, 100, 100, kernel.Limits())


if __name__ == "__main__":
    unittest.main(verbosity=2)
