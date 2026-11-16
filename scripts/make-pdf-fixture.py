#!/usr/bin/env python3
"""E2E용 한글 PDF 이력서를 만듭니다.

실제 한글 PDF와 같은 구조(Type0 폰트 · Identity-H 2바이트 코드 · ToUnicode CMap · FlateDecode 본문)를
직접 조립합니다. 앱의 PDF 텍스트 추출기(src/lib/pdf.ts)가 이 구조를 읽는지 확인하는 픽스처입니다.
"""

import os
import zlib

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "scripts/fixtures/my-resume.pdf")

LINES = [
    "이름: 김하람",
    "한 줄 소개: 브랜드 커뮤니케이션 매니저",
    "경력: 6년",
    "소개",
    "브랜드 캠페인과 SNS 채널을 직접 운영해 온 6년차 커뮤니케이터입니다.",
    "경력",
    "노바커머스 | 브랜드 커뮤니케이션 매니저 | 2021.03 – 현재",
    "- 브랜드 캠페인 8건을 기획·실행해 자사몰 신규 방문 28% 증가를 만들었습니다.",
    "- 인플루언서 90명 협업 프로그램을 운영해 콘텐츠 140건을 제작했습니다.",
    "- SNS 3개 채널 콘텐츠 캘린더를 운영해 팔로워 4.2만을 유지했습니다.",
    "- 위기 이슈 2건에 대응해 공식 입장문을 작성하고 24시간 내 배포했습니다.",
    "스타트업라운지 | 콘텐츠 마케터 | 2019.01 – 2021.02",
    "- 콘텐츠 120편을 기획·제작해 월 방문자 3.1배 증가를 기록했습니다.",
    "- 뉴스레터를 격주 발행해 구독자 8,000명을 확보했습니다.",
    "스킬",
    "브랜드 캠페인, SNS 운영, 인플루언서 마케팅, 콘텐츠 기획, 성과 분석",
    "산업",
    "커머스, 콘텐츠",
]


def build():
    codes = {}
    def code_for(ch):
        if ch not in codes:
            codes[ch] = len(codes) + 1
        return codes[ch]

    # 모든 글자에 2바이트 코드 부여
    for line in LINES:
        for ch in line:
            code_for(ch)

    commands = ["BT", "/F1 11 Tf", "50 800 Td"]
    for index, line in enumerate(LINES):
        hex_line = "".join(f"{code_for(ch):04X}" for ch in line)
        if index > 0:
            commands.append("0 -16 Td")
        commands.append(f"<{hex_line}> Tj")
    commands.append("ET")
    content = ("\n".join(commands)).encode("utf-8")
    content_stream = zlib.compress(content)

    cmap_lines = [
        "/CIDInit /ProcSet findresource begin",
        "12 dict begin",
        "begincmap",
        "/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def",
        "/CMapName /Adobe-Identity-UCS def",
        "/CMapType 2 def",
        "1 begincodespacerange",
        "<0000> <FFFF>",
        "endcodespacerange",
        f"{len(codes)} beginbfchar",
    ]
    for ch, code in codes.items():
        cmap_lines.append(f"<{code:04X}> <{ord(ch):04X}>")
    cmap_lines += ["endbfchar", "endcmap", "CMapName currentdict /CMap defineresource pop", "end", "end"]
    cmap = ("\n".join(cmap_lines)).encode("utf-8")

    objects = [
        b"<< /Type /Catalog /Pages 2 0 R >>",
        b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] "
        b"/Resources << /Font << /F1 4 0 R >> >> /Contents 6 0 R >>",
        b"<< /Type /Font /Subtype /Type0 /BaseFont /NotoSansKR /Encoding /Identity-H "
        b"/DescendantFonts [5 0 R] /ToUnicode 7 0 R >>",
        b"<< /Type /Font /Subtype /CIDFontType2 /BaseFont /NotoSansKR "
        b"/CIDSystemInfo << /Registry (Adobe) /Ordering (Identity) /Supplement 0 >> /DW 1000 >>",
        b"<< /Length " + str(len(content_stream)).encode() + b" /Filter /FlateDecode >>\nstream\n" + content_stream + b"\nendstream",
        b"<< /Length " + str(len(cmap)).encode() + b" >>\nstream\n" + cmap + b"\nendstream",
    ]

    out = bytearray(b"%PDF-1.4\n%\xe2\xe3\xcf\xd3\n")
    offsets = []
    for index, body in enumerate(objects, start=1):
        offsets.append(len(out))
        out += f"{index} 0 obj\n".encode() + body + b"\nendobj\n"
    xref_at = len(out)
    out += f"xref\n0 {len(objects) + 1}\n".encode()
    out += b"0000000000 65535 f \n"
    for offset in offsets:
        out += f"{offset:010d} 00000 n \n".encode()
    out += f"trailer\n<< /Size {len(objects) + 1} /Root 1 0 R >>\nstartxref\n{xref_at}\n%%EOF\n".encode()

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "wb") as handle:
        handle.write(bytes(out))
    print(f"wrote {OUT} ({len(out)} bytes, {len(codes)} glyph codes)")


if __name__ == "__main__":
    build()
