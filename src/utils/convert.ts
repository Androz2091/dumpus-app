import LZString from "lz-string";

export function stringToUint8Array(
  data: string,
  { decompress = true }: { decompress?: boolean } = {},
) {
  return new Uint8Array(
    JSON.parse(decompress ? LZString.decompressFromUTF16(data) : data),
  );
}
