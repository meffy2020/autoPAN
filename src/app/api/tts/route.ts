import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_TEXT_LENGTH = 180;

function getTranslateTtsUrl(text: string) {
  const url = new URL("https://translate.google.com/translate_tts");
  url.searchParams.set("ie", "UTF-8");
  url.searchParams.set("client", "tw-ob");
  url.searchParams.set("tl", "ko");
  url.searchParams.set("q", text);
  return url;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const text = searchParams.get("text")?.trim() ?? "";

  if (!text) {
    return NextResponse.json(
      { ok: false, error: "TTS text is required." },
      { status: 400 },
    );
  }

  if (text.length > MAX_TEXT_LENGTH) {
    return NextResponse.json(
      { ok: false, error: "TTS text is too long." },
      { status: 400 },
    );
  }

  try {
    const response = await fetch(getTranslateTtsUrl(text), {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Mobile Safari/537.36",
      },
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error(`Translate TTS failed with ${response.status}`);
    }

    return new Response(await response.arrayBuffer(), {
      headers: {
        "Cache-Control": "no-store",
        "Content-Type": response.headers.get("content-type") ?? "audio/mpeg",
      },
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { ok: false, error: "TTS audio could not be generated." },
      { status: 502 },
    );
  }
}
