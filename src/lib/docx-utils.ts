import mammoth from "mammoth";

export async function extractDocxText(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  const result = await mammoth.extractRawText({ arrayBuffer });
  return result.value;
}

export async function extractDocxWithImages(file: File): Promise<{ text: string; images: string[] }> {
  const arrayBuffer = await file.arrayBuffer();
  const images: string[] = [];

  const result = await mammoth.convertToHtml(
    { arrayBuffer },
    {
      convertImage: mammoth.images.imgElement((image: any) => {
        return image.read("base64").then((imageBuffer: string) => {
          const contentType = image.contentType || "image/png";
          if (contentType.includes("wmf") || contentType.includes("emf")) return { src: "" };
          const dataUrl = `data:${contentType};base64,${imageBuffer}`;
          images.push(dataUrl);
          return { src: dataUrl };
        });
      }),
    }
  );

  const textResult = await mammoth.extractRawText({ arrayBuffer });
  return { text: textResult.value, images };
}

export function isDocxFile(file: File): Promise<boolean> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => {
      const bytes = new Uint8Array(reader.result as ArrayBuffer);
      resolve(
        bytes.length >= 4 &&
        bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04
      );
    };
    reader.onerror = () => resolve(false);
    reader.readAsArrayBuffer(file.slice(0, 4));
  });
}
