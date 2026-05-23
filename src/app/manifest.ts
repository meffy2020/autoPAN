import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "나놀다판 운영 자동화",
    short_name: "나놀다판",
    description:
      "노원청소년센터 나놀다판 현장 접수, 대기열, 결제기록, TTS 호출용 PWA",
    start_url: "/kiosk",
    scope: "/",
    display: "standalone",
    background_color: "#020617",
    theme_color: "#22d3ee",
    lang: "ko-KR",
    icons: [
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
      },
    ],
  };
}
