import { describe, it, expect, vi, beforeEach } from "vitest";
import { uploadImageDataUrl } from "./imageUpload";

const storageUploadMock = vi.fn();
const storageGetPublicUrlMock = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    storage: {
      from: () => ({
        upload: (...a: unknown[]) => storageUploadMock(...a),
        getPublicUrl: (...a: unknown[]) => storageGetPublicUrlMock(...a),
      }),
    },
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
  storageUploadMock.mockResolvedValue({ error: null });
  storageGetPublicUrlMock.mockReturnValue({ data: { publicUrl: "https://bucket.example/img.png" } });
});

describe("uploadImageDataUrl", () => {
  it("uploads the blob under the user's folder and returns the public URL", async () => {
    const result = await uploadImageDataUrl("data:image/png;base64,AAAA", "user-1");
    expect(result).toBe("https://bucket.example/img.png");
    expect(storageUploadMock).toHaveBeenCalledWith(
      expect.stringMatching(/^user-1\//),
      expect.any(Blob),
      { contentType: "image/png" },
    );
  });

  it("returns null and logs when the upload fails", async () => {
    storageUploadMock.mockResolvedValueOnce({ error: { message: "storage down" } });
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const result = await uploadImageDataUrl("data:image/png;base64,AAAA", "user-1");
    expect(result).toBeNull();
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});
