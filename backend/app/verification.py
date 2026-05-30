from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import date
from typing import Any, Optional

import io

import pytesseract
from PIL import Image
from PyPDF2 import PdfReader
from rapidfuzz import fuzz


def _normalize_name(s: str) -> str:
    s = s.lower()
    s = re.sub(r"[^a-z\s]", " ", s)
    s = re.sub(r"\s+", " ", s).strip()
    return s


@dataclass(frozen=True)
class ExtractedFields:
    name: Optional[str]
    dob: Optional[date]
    confidence: Optional[float]


_dob_patterns = [
    re.compile(r"\b(\d{2})[\/\-](\d{2})[\/\-](\d{4})\b"),  # DD/MM/YYYY
    re.compile(r"\b(\d{4})[\/\-](\d{2})[\/\-](\d{2})\b"),  # YYYY/MM/DD
]


def _parse_dob(text: str) -> Optional[date]:
    """
    Pick the most likely DOB from text by scoring context.
    This avoids selecting non-DOB dates like "Details as on" or "Issued".
    """
    t = text or ""
    lower = t.lower()

    candidates: list[tuple[int, int, int, int]] = []  # (score, yyyy, mm, dd)

    def score_at(pos: int) -> int:
        window = lower[max(0, pos - 40) : min(len(lower), pos + 40)]
        score = 0
        # positive signals
        if "dob" in window or "date of birth" in window:
            score += 50
        if "birth" in window:
            score += 20
        if "ಜನ್ಮ" in window:  # common on Aadhaar
            score += 30
        # negative signals
        if "details as on" in window:
            score -= 60
        if "issued" in window:
            score -= 40
        if "enrolment" in window or "enrollment" in window:
            score -= 20
        return score

    for pat in _dob_patterns:
        for m in pat.finditer(t):
            try:
                if pat.pattern.startswith("\\b(\\d{2})"):
                    dd, mm, yyyy = int(m.group(1)), int(m.group(2)), int(m.group(3))
                else:
                    yyyy, mm, dd = int(m.group(1)), int(m.group(2)), int(m.group(3))
                dt = date(yyyy, mm, dd)
                score = score_at(m.start())
                # favor realistic DOB range (1900..today)
                if not (1900 <= dt.year <= date.today().year):
                    score -= 30
                candidates.append((score, dt.year, dt.month, dt.day))
            except Exception:
                continue

    if not candidates:
        return None

    candidates.sort(key=lambda x: x[0], reverse=True)
    best = candidates[0]
    return date(best[1], best[2], best[3])


def _guess_name(text: str) -> Optional[str]:
    # Very lightweight heuristic: look for a line starting with "Name" or "NAME"
    lines = [ln.strip() for ln in text.splitlines() if ln.strip()]
    for ln in lines:
        if re.match(r"^(name|full name)\b", ln.lower()):
            # split on ':' if present
            parts = re.split(r"[:\-]", ln, maxsplit=1)
            if len(parts) == 2 and parts[1].strip():
                return parts[1].strip()
    # fallback: take the longest all-alpha line (often name on IDs)
    alpha_lines = [ln for ln in lines if re.fullmatch(r"[A-Za-z ]{5,}", ln)]
    if not alpha_lines:
        return None
    return max(alpha_lines, key=len).strip()


def extract_text_from_image_bytes(image_bytes: bytes) -> str:
    img = Image.open(io.BytesIO(image_bytes))
    return pytesseract.image_to_string(img)


def extract_text_from_pdf_bytes(pdf_bytes: bytes, max_pages: int = 3) -> str:
    """
    Lightweight PDF text extraction (NOT OCR).
    - Works for digital PDFs with embedded text.
    - Scanned PDFs will typically return empty text; OCR for scanned PDFs can be added later.
    """
    reader = PdfReader(io.BytesIO(pdf_bytes))
    texts: list[str] = []
    for i, page in enumerate(reader.pages[:max_pages]):
        try:
            t = page.extract_text() or ""
        except Exception:
            t = ""
        t = t.strip()
        if t:
            texts.append(t)
    return "\n\n".join(texts).strip()


def extract_fields(ocr_text: str) -> ExtractedFields:
    dob = _parse_dob(ocr_text)
    name = _guess_name(ocr_text)
    return ExtractedFields(name=name, dob=dob, confidence=None)


def _parse_profile_dob(profile_dob: str) -> Optional[date]:
    """
    Parse profile DOB from DB/storage.
    Supports both "YYYY-MM-DD" and "DD-MM-YYYY" (also "/" as separator).
    """
    t = (profile_dob or "").strip()
    if not t:
        return None
    t = t.replace("/", "-")
    parts = t.split("-")
    if len(parts) != 3:
        return None
    a, b, c = parts
    try:
        if len(a) == 4:
            # YYYY-MM-DD
            yyyy, mm, dd = int(a), int(b), int(c)
        elif len(c) == 4:
            # DD-MM-YYYY
            dd, mm, yyyy = int(a), int(b), int(c)
        else:
            return None
        return date(yyyy, mm, dd)
    except Exception:
        return None


def verify_profile(
    profile_full_name: Optional[str],
    profile_dob: Optional[str],
    extracted: ExtractedFields,
    min_name_score: int = 85,
) -> tuple[bool, dict[str, Any]]:
    # DOB exact if extracted
    dob_match = None
    if extracted.dob and profile_dob:
        parsed = _parse_profile_dob(profile_dob)
        if parsed is None:
            dob_match = False
        else:
            dob_match = extracted.dob == parsed

    name_score = None
    name_match = None
    if extracted.name and profile_full_name:
        a = _normalize_name(extracted.name)
        b = _normalize_name(profile_full_name)
        name_score = int(fuzz.token_set_ratio(a, b))
        name_match = name_score >= min_name_score

    # lenient: fuzzy name + DOB exact (if DOB extracted); if DOB not extracted, don't auto-verify
    verified = bool(name_match) and bool(dob_match)
    details = {"name_score": name_score, "name_match": name_match, "dob_match": dob_match}
    return verified, details

