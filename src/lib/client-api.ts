"use client";

export async function postMutation<T>(action: string, payload?: unknown) {
  const response = await fetch("/api/mutations", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      action,
      payload,
    }),
  });

  const data = (await response.json()) as {
    ok?: boolean;
    error?: string;
    result?: T;
  };

  if (!response.ok || !data.ok) {
    throw new Error(data.error ?? "요청 처리에 실패했습니다.");
  }

  return data.result as T;
}

export async function getJson<T>(url: string) {
  const response = await fetch(url);
  const data = (await response.json()) as T & {
    ok?: boolean;
    error?: string;
  };

  if (!response.ok || data.ok === false) {
    throw new Error(data.error ?? "요청 처리에 실패했습니다.");
  }

  return data;
}
