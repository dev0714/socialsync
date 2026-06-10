// Generates an image from a plain-language description using a configurable image API.
// Claude does not generate images, so this uses a separate provider, selected via IMAGE_PROVIDER
// (default "openai"). Authenticated with IMAGE_API_KEY. Returns raw bytes for upload to storage.
//
// To add a provider (e.g. fal.ai, Replicate, Google Imagen), add a branch in generateImage().

export type ImageInput = {
  prompt: string;
  size?: string;
};

export type GeneratedImage = {
  data: Buffer;
  contentType: string;
};

export function isImageConfigured(): boolean {
  return Boolean(process.env.IMAGE_API_KEY);
}

export async function generateImage(input: ImageInput): Promise<GeneratedImage> {
  const apiKey = process.env.IMAGE_API_KEY;
  if (!apiKey) {
    throw new Error("IMAGE_API_KEY is not configured.");
  }

  const provider = (process.env.IMAGE_PROVIDER || "openai").toLowerCase();
  switch (provider) {
    case "openai":
      return generateWithOpenAI(apiKey, input);
    default:
      throw new Error(`Unsupported IMAGE_PROVIDER: ${provider}`);
  }
}

async function generateWithOpenAI(apiKey: string, input: ImageInput): Promise<GeneratedImage> {
  const response = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.IMAGE_MODEL || "gpt-image-1",
      prompt: input.prompt,
      size: input.size || "1024x1024",
      n: 1,
    }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Image provider error (${response.status}): ${detail.slice(0, 300)}`);
  }

  const json = (await response.json()) as { data?: Array<{ b64_json?: string; url?: string }> };
  const first = json.data?.[0];

  if (first?.b64_json) {
    return { data: Buffer.from(first.b64_json, "base64"), contentType: "image/png" };
  }
  if (first?.url) {
    const imgRes = await fetch(first.url);
    if (!imgRes.ok) throw new Error("Failed to download generated image.");
    const buf = Buffer.from(await imgRes.arrayBuffer());
    return { data: buf, contentType: imgRes.headers.get("content-type") || "image/png" };
  }
  throw new Error("Image provider returned no image data.");
}
