/**
 * PDF에서 텍스트만 뽑는 최소 구현.
 *
 * - PDF 구조를 스캔해 각 stream을 FlateDecode로 풀고, 텍스트 표시 연산자(Tj·TJ)만 모읍니다.
 * - 폰트의 ToUnicode CMap(bfchar·bfrange)을 읽어 2바이트 코드를 실제 글자로 바꿉니다.
 *   (한글 PDF는 대부분 이 표가 들어 있습니다)
 * - 스캔 이미지 PDF나 암호화 PDF는 글자가 나오지 않습니다. 그때는 ok=false로 돌려주고
 *   화면에서 .txt/.md 또는 본문 붙여넣기를 안내합니다.
 */

export interface PdfTextResult {
  text: string;
  pages: number;
  ok: boolean;
  reason?: string;
}

const decoder = new TextDecoder("latin1");

function latin1(bytes: Uint8Array): string {
  return decoder.decode(bytes);
}

async function inflate(bytes: Uint8Array): Promise<Uint8Array | null> {
  const formats = ["deflate", "deflate-raw"] as const;
  for (const format of formats) {
    try {
      const stream = new Blob([bytes as unknown as BlobPart]).stream().pipeThrough(new DecompressionStream(format));
      const buffer = await new Response(stream).arrayBuffer();
      return new Uint8Array(buffer);
    } catch {
      /* 다음 형식 시도 */
    }
  }
  return null;
}

interface RawStream {
  text: string;
  decoded: boolean;
}

function streamRanges(raw: string): { start: number; end: number }[] {
  const ranges: { start: number; end: number }[] = [];
  let cursor = 0;
  for (;;) {
    const keyword = raw.indexOf("stream", cursor);
    if (keyword < 0) break;
    let start = keyword + "stream".length;
    if (raw[start] === "\r") start += 1;
    if (raw[start] === "\n") start += 1;
    const end = raw.indexOf("endstream", start);
    if (end < 0) break;
    let stop = end;
    while (stop > start && (raw[stop - 1] === "\n" || raw[stop - 1] === "\r")) stop -= 1;
    ranges.push({ start, end: stop });
    cursor = end + "endstream".length;
  }
  return ranges;
}

function hexToUnicode(hex: string): string {
  const clean = hex.replace(/\s+/g, "");
  if (clean.length < 2) return "";
  const bytes: number[] = [];
  for (let i = 0; i + 1 < clean.length; i += 2) bytes.push(parseInt(clean.slice(i, i + 2), 16));
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    let out = "";
    for (let i = 2; i + 1 < bytes.length; i += 2) out += String.fromCharCode((bytes[i] << 8) | bytes[i + 1]);
    return out;
  }
  let out = "";
  for (let i = 0; i + 1 < bytes.length; i += 2) out += String.fromCharCode((bytes[i] << 8) | bytes[i + 1]);
  return out || String.fromCharCode(bytes[0]);
}

function parseCMap(text: string, map: Map<string, string>) {
  for (const block of text.matchAll(/beginbfchar([\s\S]*?)endbfchar/g)) {
    for (const pair of (block[1] ?? "").matchAll(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g)) {
      const key = (pair[1] ?? "").toUpperCase();
      const value = hexToUnicode(pair[2] ?? "");
      if (key && value) map.set(key, value);
    }
  }
  for (const block of text.matchAll(/beginbfrange([\s\S]*?)endbfrange/g)) {
    for (const triple of (block[1] ?? "").matchAll(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g)) {
      const loHex = triple[1] ?? "";
      const hiHex = triple[2] ?? "";
      const dstRaw = triple[3] ?? "";
      const width = loHex.length;
      const lo = parseInt(loHex, 16);
      const hi = parseInt(hiHex, 16);
      if (!Number.isFinite(lo) || !Number.isFinite(hi) || hi < lo || hi - lo > 65_535) continue;
      const dstStart = parseInt(dstRaw, 16);
      for (let code = lo; code <= hi; code += 1) {
        const destHex = (dstStart + (code - lo)).toString(16).padStart(dstRaw.length, "0");
        const value = hexToUnicode(destHex);
        if (value) map.set(code.toString(16).padStart(width, "0").toUpperCase(), value);
      }
    }
  }
}

const hex1 = (byte: number) => byte.toString(16).padStart(2, "0").toUpperCase();
const hex2 = (hi: number, lo: number) => `${hex1(hi)}${hex1(lo)}`;

function decodeCodes(bytes: number[], map: Map<string, string>): string {
  if (!bytes.length) return "";
  if (map.size) {
    if (bytes.length % 2 === 0) {
      let out = "";
      let ok = true;
      for (let i = 0; i < bytes.length; i += 2) {
        const value = map.get(hex2(bytes[i] ?? 0, bytes[i + 1] ?? 0));
        if (value === undefined) {
          ok = false;
          break;
        }
        out += value;
      }
      if (ok && out) return out;
    }
    let out = "";
    let ok = true;
    for (const byte of bytes) {
      const value = map.get(hex1(byte));
      if (value === undefined) {
        ok = false;
        break;
      }
      out += value;
    }
    if (ok && out) return out;
  }
  return bytes
    .map((byte) => (byte >= 32 && byte < 127 ? String.fromCharCode(byte) : byte >= 0x80 ? "" : ""))
    .join("");
}

function literalBytes(body: string): number[] {
  const bytes: number[] = [];
  for (let i = 0; i < body.length; i += 1) {
    const char = body[i] ?? "";
    if (char !== "\\") {
      bytes.push(char.charCodeAt(0) & 0xff);
      continue;
    }
    const next = body[i + 1] ?? "";
    i += 1;
    if (next === "n") bytes.push(10);
    else if (next === "r") bytes.push(13);
    else if (next === "t") bytes.push(9);
    else if (next === "b") bytes.push(8);
    else if (next === "f") bytes.push(12);
    else if (next === "\n") continue;
    else if (/[0-7]/.test(next)) {
      let octal = next;
      while (octal.length < 3 && /[0-7]/.test(body[i + 1] ?? "")) {
        octal += body[i + 1];
        i += 1;
      }
      bytes.push(parseInt(octal, 8) & 0xff);
    } else bytes.push(next.charCodeAt(0) & 0xff);
  }
  return bytes;
}

function hexBytes(body: string): number[] {
  const clean = body.replace(/[^0-9A-Fa-f]/g, "");
  const padded = clean.length % 2 === 0 ? clean : `${clean}0`;
  const bytes: number[] = [];
  for (let i = 0; i + 1 < padded.length; i += 2) bytes.push(parseInt(padded.slice(i, i + 2), 16));
  return bytes;
}

const TOKEN = /\((?:\\.|[^\\()])*\)|<[0-9A-Fa-f\s]+>|\bT[djDJ*]|'|"/g;

function extractFromContent(content: string, map: Map<string, string>): string {
  const out: string[] = [];
  for (const match of content.matchAll(TOKEN)) {
    const token = match[0];
    if (token.startsWith("(")) {
      out.push(decodeCodes(literalBytes(token.slice(1, -1)), map));
    } else if (token.startsWith("<") && !token.startsWith("<<")) {
      out.push(decodeCodes(hexBytes(token.slice(1, -1)), map));
    } else if (token === "Td" || token === "TD" || token === "T*" || token === "'" || token === '"') {
      out.push("\n");
    } else if (token === "TJ" || token === "Tj") {
      out.push(" ");
    }
  }
  return out.join("");
}

function cleanText(input: string): string {
  return input
    .replace(/\r/g, "")
    .replace(/[ \t\u00a0]+/g, " ")
    .split("\n")
    .map((line) => line.trim())
    .join("\n")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

const HANGUL = /[가-힣]/;

export async function extractPdfText(data: ArrayBuffer): Promise<PdfTextResult> {
  const bytes = new Uint8Array(data);
  const raw = latin1(bytes);
  const pages = Math.max(1, (raw.match(/\/Type\s*\/Page[^s]/g) ?? []).length);

  const ranges = streamRanges(raw);
  const streams: RawStream[] = [];
  for (const range of ranges) {
    const slice = bytes.subarray(range.start, range.end);
    if (slice.length === 0) continue;
    const inflated = slice.length > 32 ? await inflate(slice) : null;
    if (inflated) streams.push({ text: latin1(inflated), decoded: true });
    else streams.push({ text: latin1(slice), decoded: false });
  }

  const map = new Map<string, string>();
  for (const stream of streams) {
    if (!/beginbfchar|beginbfrange/.test(stream.text)) continue;
    parseCMap(stream.text, map);
  }

  const pieces: string[] = [];
  for (const stream of streams) {
    if (!/Tj|TJ/.test(stream.text)) continue;
    pieces.push(extractFromContent(stream.text, map));
  }

  const text = cleanText(pieces.join("\n"));
  const letters = text.replace(/[^A-Za-z가-힣]/g, "").length;
  const hangul = (text.match(HANGUL) ?? []).length;
  const broken = (text.match(/[\uFFFD]/g) ?? []).length;

  if (letters < 20) {
    return { text, pages, ok: false, reason: "PDF에서 글자를 찾지 못했습니다(스캔 이미지일 수 있습니다)." };
  }
  if (broken > letters * 0.25) {
    return { text, pages, ok: false, reason: "PDF 글꼴 표를 해석하지 못했습니다. .txt/.md로 저장해 올려 주세요." };
  }
  if (hangul === 0 && !/[가-힣]/.test(text) && letters > 40 && /[\u3131-\uD79D]/.test(text)) {
    return { text, pages, ok: false, reason: "한글이 자모 단위로 깨져 나왔습니다. .txt/.md로 저장해 올려 주세요." };
  }
  return { text, pages, ok: true };
}
