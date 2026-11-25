"""DOCX 이력서 픽스처 생성 — my-resume.txt를 Word 문서로 감쌉니다.

  python3 scripts/make-docx-fixture.py
"""

import os
import zipfile
from xml.sax.saxutils import escape

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FIXTURES = os.path.join(ROOT, "scripts/fixtures")
SOURCE = os.path.join(FIXTURES, "my-resume.txt")
TARGET = os.path.join(FIXTURES, "my-resume.docx")

CONTENT_TYPES = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>"""

RELS = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>"""


def document_xml(text: str) -> str:
    paragraphs = []
    for line in text.splitlines():
        body = escape(line) if line.strip() else ""
        paragraphs.append(f"<w:p><w:r><w:t xml:space=\"preserve\">{body}</w:t></w:r></w:p>")
    return (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>'
        + "".join(paragraphs)
        + '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/></w:sectPr></w:body></w:document>'
    )


def main():
    text = open(SOURCE, encoding="utf-8").read()
    with zipfile.ZipFile(TARGET, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("[Content_Types].xml", CONTENT_TYPES)
        zf.writestr("_rels/.rels", RELS)
        zf.writestr("word/document.xml", document_xml(text))
    print("wrote", TARGET, os.path.getsize(TARGET), "bytes")


if __name__ == "__main__":
    main()
