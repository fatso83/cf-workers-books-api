import { withCors, handleOptions } from "./cors";
import { BookDurableObject } from "./bookObject";
import { BookIndexDurableObject } from "./bookIndexObject";

const json = (data, init = {}) =>
  new Response(JSON.stringify(data, null, 2), {
    headers: { "content-type": "application/json; charset=utf-8" },
    ...init,
  });

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const method = request.method.toUpperCase();

    if (method === "OPTIONS") {
      return handleOptions(request);
    }

    const segments = url.pathname.replace(/^\/+|\/+$/g, "").split("/");
    if (segments[0] !== "api" || segments.length < 3) {
      return withCors(json({ success: false, error: "Route not found" }, { status: 404 }));
    }

    const email = decodeURIComponent(segments[1] || "");
    if (!email || !email.includes("@")) {
      return withCors(json({ success: false, error: "Invalid or missing email in path." }, { status: 400 }));
    }
    const tail = segments.slice(2).join("/");

    try {
      if (tail === "books" || tail === "reset") {
        const id = env.BOOKS.idFromName(email);
        const stub = env.BOOKS.get(id);
        const res = await stub.fetch(`https://user.internal/${tail}?email=${encodeURIComponent(email)}`, {
          method,
          headers: request.headers,
          body: method === "POST" ? await request.text() : undefined,
        });
        return withCors(res);
      }

      if (tail === "allbooks") {
        const indexId = env.BOOK_INDEX.idFromName("global");
        const indexStub = env.BOOK_INDEX.get(indexId);
        const res = await indexStub.fetch("https://index.internal/allbooks");
        return withCors(res);
      }

      return withCors(json({ success: false, error: "Unknown route" }, { status: 404 }));
    } catch (err) {
      const message = (err && typeof err === "object" && "message" in err) ? err.message : String(err);
      return withCors(json({ success: false, error: message }, { status: 500 }));
    }
  },
};

export { BookDurableObject, BookIndexDurableObject };
