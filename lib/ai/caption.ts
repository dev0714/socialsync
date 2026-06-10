import Anthropic from "@anthropic-ai/sdk";

// Generates an on-brand social caption for MeanKat Café from a plain-language description,
// using Claude (Anthropic). The caption is editable by the user before publishing.

export type CaptionInput = {
  prompt: string;
  tone?: string;
  platforms?: string[];
};

export type CaptionResult = {
  caption: string;
  hashtags: string[];
};

export function isCaptionConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

const SYSTEM_PROMPT = `You are the social media manager for MeanKat Café, a cat rescue café in Durban, South Africa.
You write warm, upbeat, on-brand captions that drive café visits, cat adoptions, donations, and volunteering.
Guidelines:
- Keep captions concise, engaging, and friendly. Light, tasteful emoji are welcome.
- Never invent facts — do not state specific prices, dates, medical claims, or statistics that are not in the description.
- Write copy that reads well across Instagram, Facebook, TikTok, LinkedIn, and YouTube.
- Return a caption plus a short set of relevant, lowercase hashtags (no more than 8).`;

export async function generateCaption(input: CaptionInput): Promise<CaptionResult> {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY is not configured.");
  }

  const client = new Anthropic();
  const toneLine = input.tone ? `Desired tone: ${input.tone}.` : "";
  const platformLine = input.platforms?.length
    ? `Intended platforms: ${input.platforms.join(", ")}.`
    : "";

  const response = await client.messages.create({
    model: "claude-opus-4-8",
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    output_config: {
      format: {
        type: "json_schema",
        schema: {
          type: "object",
          properties: {
            caption: { type: "string" },
            hashtags: { type: "array", items: { type: "string" } },
          },
          required: ["caption", "hashtags"],
          additionalProperties: false,
        },
      },
    },
    messages: [
      {
        role: "user",
        content: `Write a social media post based on this description:\n\n${input.prompt}\n\n${toneLine}\n${platformLine}`.trim(),
      },
    ],
  });

  const textBlock = response.content.find((block) => block.type === "text");
  const raw = textBlock && "text" in textBlock ? textBlock.text : "{}";

  try {
    const parsed = JSON.parse(raw) as Partial<CaptionResult>;
    return {
      caption: parsed.caption ?? "",
      hashtags: Array.isArray(parsed.hashtags) ? parsed.hashtags : [],
    };
  } catch {
    return { caption: raw, hashtags: [] };
  }
}
