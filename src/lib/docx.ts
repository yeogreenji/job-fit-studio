/**
 * DOCX(Word)에서 글자만 뽑는 최소 구현.
 *
 * DOCX는 ZIP 컨테이너이고 본문은 `word/document.xml`에 있습니다. 브라우저의
 * DecompressionStream('deflate-raw')으로 그 항목만 풀어, 문단(w:p)과 표 칸(w:tc)을
 * 줄 단위 텍스트로 바꿉니다. 서식·이미지·각주는 읽지 않고, 스캔 문서는 글자가 없습니다.
 * 파일은 브라우저 안에서만 읽고 서버로 보내지 않습니다.
 */

export interface DocxTextResult {
  text: string;
  ok: boolean;
  reason?: string;
}

const MAX_XML_BYTES = 6_000_000;

const u16 = (view: DataView, offset: number): number => view.getUint16(offset, true);
const u32 = (view: DataView, offset: number): number => view.getUint32(offset, true);

interface ZipEntry {
  name: string;
  method: number;
  compressedSize: number;
  localOffset: number;
}

/** ZIP 끝의 중앙 디렉터리를 읽어 항목 목록을 만듭니다. */
function readCentralDirectory(view: DataView, bytes: Uint8Array): ZipEntry[] {
  const length = bytes.length;
  let eocd = -1;
  for (let offset = length - 22; offset >= Math.max(0, length - 66_000); offset -= 1) {
    if (u32(view, offset) === 0x06054b50) {
      eocd = offset;
      break;
    }
  }
  if (eocd < 0) return [];

  const total = u16(view, eocd + 10);
  const dirOffset = u32(view, eocd + 16);
  const entries: ZipEntry[] = [];
  let cursor = dirOffset;
  for (let index = 0; index < total; index += 1) {
    if (cursor + 46 > length || u32(view, cursor) !== 0x02014b50) break;
    const method = u16(view, cursor + 10);
    const compressedSize = u32(view, cursor + 20);
    const nameLength = u16(view, cursor + 28);
    const extraLength = u16(view, cursor + 30);
    const commentLength = u16(view, cursor + 32);
    const localOffset = u32(view, cursor + 42);
    const name = new TextDecoder("utf-8").decode(bytes.subarray(cursor + 46, cursor + 46 + nameLength));
    entries.push({ name, method, compressedSize, localOffset });
    cursor += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

async function inflateRaw(bytes: Uint8Array): Promise<Uint8Array | null> {
  try {
    const stream = new Blob([bytes as unknown as BlobPart]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
    const buffer = await new Response(stream).arrayBuffer();
    return new Uint8Array(buffer);
  } catch {
    return null;
  }
}

/** `word/document.xml`의 문단을 줄 단위 글자로 바꿉니다. */
function textFromDocumentXml(xml: string): string {
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  if (doc.getElementsByTagName("parsererror").length) return "";

  const paragraphs = Array.from(doc.getElementsByTagNameNS("*", "p"));
  const lines: string[] = [];
  for (const paragraph of paragraphs) {
    let line = "";
    for (const node of Array.from(paragraph.getElementsByTagNameNS("*", "t"))) {
      line += node.textContent ?? "";
    }
    // 표 안의 문단은 한 줄로 이어도 읽는 데 문제없습니다.
    const cleaned = line.replace(/\s+/g, " ").trim();
    if (cleaned) lines.push(cleaned);
  }
  return lines.join("\n");
}

export async function extractDocxText(buffer: ArrayBuffer): Promise<DocxTextResult> {
  const bytes = new Uint8Array(buffer);
  if (bytes.length < 4 || u32(new DataView(buffer), 0) !== 0x04034b50) {
    return { text: "", ok: false, reason: "DOCX 파일 형식이 아닙니다." };
  }

  const view = new DataView(buffer);
  const entry = readCentralDirectory(view, bytes).find((item) => item.name === "word/document.xml");
  if (!entry) {
    return { text: "", ok: false, reason: "DOCX 안에서 본문(word/document.xml)을 찾지 못했습니다." };
  }

  const local = entry.localOffset;
  if (local + 30 > bytes.length || u32(view, local) !== 0x04034b50) {
    return { text: "", ok: false, reason: "DOCX 압축 구조를 읽지 못했습니다." };
  }
  const nameLength = u16(view, local + 26);
  const extraLength = u16(view, local + 28);
  const start = local + 30 + nameLength + extraLength;
  const end = start + entry.compressedSize;
  if (end > bytes.length) {
    return { text: "", ok: false, reason: "DOCX 본문 길이가 맞지 않습니다." };
  }

  let xmlBytes: Uint8Array | null;
  if (entry.method === 0) {
    xmlBytes = bytes.subarray(start, end);
  } else if (entry.method === 8) {
    xmlBytes = await inflateRaw(bytes.subarray(start, end));
  } else {
    xmlBytes = null;
  }
  if (!xmlBytes) {
    return { text: "", ok: false, reason: "이 DOCX의 압축 방식을 지원하지 않습니다." };
  }
  if (xmlBytes.length > MAX_XML_BYTES) {
    return { text: "", ok: false, reason: "DOCX 본문이 너무 큽니다(6MB 초과)." };
  }

  const xml = new TextDecoder("utf-8").decode(xmlBytes);
  const text = textFromDocumentXml(xml);
  if (text.replace(/\s/g, "").length < 20) {
    return { text: "", ok: false, reason: "DOCX에서 글자를 찾지 못했습니다(이미지로 된 문서일 수 있습니다)." };
  }
  return { text, ok: true };
}
