import { withCors, handleOptions } from "./cors";

export class BookDurableObject {
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

    if (method === "GET" && url.pathname.endsWith("/books")) {
      const values = Array.from((await this.state.storage.list()).values());
      const books = values.filter(v => v && v.bookId !== undefined);
      books.sort((a, b) => a.bookId - b.bookId);
      return withCors(Response.json({ success: true, result: books }));
    }

    if (method === "POST" && url.pathname.endsWith("/books")) {
      const ownerEmail = url.searchParams.get("email") || "";
      const body = await request.json().catch(() => null);
      if (!body || !body.name || !body.author) {
        return withCors(Response.json({ success: false, error: "Body must include 'name' and 'author'." }, { status: 400 }));
      }

      const nextId = await this.state.storage.transaction(async (txn) => {
        const seq = (await txn.get("seq")) || 0;
        const next = Number(seq) + 1;
        await txn.put("seq", next);
        return next;
      });

      const book = {
        bookId: nextId,
        name: String(body.name),
        author: String(body.author),
        ownerId: ownerEmail,
      };

      await this.state.storage.put(`book:${nextId}`, book);

      const indexId = this.env.BOOK_INDEX.idFromName("global");
      const indexStub = this.env.BOOK_INDEX.get(indexId);
      await indexStub.fetch("https://index.internal/add", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(book),
      });

      return withCors(Response.json({ success: true, result: book }, { status: 201 }));
    }

    if (method === "GET" && url.pathname.endsWith("/reset")) {
      const ownerEmail = url.searchParams.get("email") || "";
      await this.state.storage.deleteAll();
      await this.state.storage.put("seq", 0);

      if (ownerEmail) {
        const indexId = this.env.BOOK_INDEX.idFromName("global");
        const indexStub = this.env.BOOK_INDEX.get(indexId);
        await indexStub.fetch(`https://index.internal/reset-owner?email=${encodeURIComponent(ownerEmail)}`);
      }

      return withCors(Response.json({ success: true, result: { deleted: true } }));
    }

    return withCors(Response.json({ success: false, error: "Not found" }, { status: 404 }));
  }
}
