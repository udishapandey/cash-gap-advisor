// Small helpers shared by the three AI routes.

const MAX_BODY_BYTES = 20_000;

export function jsonResponse(body: Record<string, unknown>, status = 200): Response {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

/** Read a small JSON body. Refuses anything large, and never throws. */
export async function readJsonBody(
  request: Request,
): Promise<{ ok: true; body: unknown } | { ok: false; response: Response }> {
  if (Number(request.headers.get("content-length")) > MAX_BODY_BYTES) {
    return { ok: false, response: jsonResponse({ ok: false, error: "That request is too large." }, 413) };
  }
  try {
    const text = await request.text();
    if (text.length > MAX_BODY_BYTES) {
      return { ok: false, response: jsonResponse({ ok: false, error: "That request is too large." }, 413) };
    }
    return { ok: true, body: JSON.parse(text) };
  } catch {
    return { ok: false, response: jsonResponse({ ok: false, error: "Couldn't read the request." }, 400) };
  }
}
