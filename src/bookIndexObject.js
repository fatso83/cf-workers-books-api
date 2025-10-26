import { withCors, handleOptions } from "./cors";

export class BookIndexDurableObject {
  constructor(state, env) {
    this.state = state;
    this.env = env;
  }

  async fetch(request) {
    const url = new URL(request.url);
    const method = request.method.toUpperCase();

    if (method === "OPTIONS") {
      return handleOptions(request);
    }

    if (method === "POST" && url.pathname.endsWith("/add")) {
      const book = await request.json().catch(() => null);
      if (!book || !book.ownerId || book.bookId === undefined) {
        return withCors(Response.json({ success: false, error: "Invalid book payload" }, { status: 400 }));
      }
      await this.state.storage.put(`${book.ownerId}:${book.bookId}`, book);
      return withCors(new Response("OK"));
    }

    if (method === "GET" && url.pathname.endsWith("/allbooks")) {
      const values = Array.from((await this.state.storage.list()).values());
      const books = values.filter(v => v && v.bookId !== undefined);
      books.sort((a, b) => a.bookId - b.bookId);
      return withCors(Response.json({ success: true, result: books }));
    }

    if (method === "GET" && url.pathname.endsWith("/reset-owner")) {
      const ownerEmail = url.searchParams.get("email") || "";
      if (!ownerEmail) return withCors(Response.json({ success: false, error: "Missing email" }, { status: 400 }));
      const list = await this.state.storage.list({ prefix: `${ownerEmail}:` });
      for (const key of list.keys()) await this.state.storage.delete(key);
      return withCors(Response.json({ success: true }));
    }

    return withCors(Response.json({ success: false, error: "Not found" }, { status: 404 }));
  }
}
