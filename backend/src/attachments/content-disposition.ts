const TURKISH_LETTERS: Readonly<Record<string, string>> = {
  ç: 'c',
  Ç: 'C',
  ğ: 'g',
  Ğ: 'G',
  ı: 'i',
  İ: 'I',
  ö: 'o',
  Ö: 'O',
  ş: 's',
  Ş: 'S',
  ü: 'u',
  Ü: 'U',
};

/** A plain ASCII stand-in for old clients: Turkish letters simplified, anything else unsafe becomes "_". */
function asciiFallback(fileName: string): string {
  return [...fileName]
    .map((char) => TURKISH_LETTERS[char] ?? char)
    .join('')
    .replace(/[^\x20-\x7e]|["\\]/gu, '_');
}

/** RFC 5987 value: percent-encoded UTF-8, with the characters encodeURIComponent leaves alone encoded too. */
function encodeRfc5987(fileName: string): string {
  return encodeURIComponent(fileName).replace(
    /['()*]/g,
    (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

/** `Content-Disposition` value for a stored display name. */
export function contentDisposition(fileName: string, inline: boolean): string {
  const type = inline ? 'inline' : 'attachment';
  return `${type}; filename="${asciiFallback(fileName)}"; filename*=UTF-8''${encodeRfc5987(fileName)}`;
}
