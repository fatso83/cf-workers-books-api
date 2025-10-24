// src/worker.ts
export interface Env {
  BOOKS: KVNamespace;
}

type Book = {
  bookId: number;
  name: string;
  ownerId: string; // email
  author: string;
};

type ApiResponse<T> = {
  success: boolean;
  result: T;
};

const json = (data: unknown, init: ResponseInit = {}) =>
  new Response(JSON.stringify(data, null, 2), {
    headers: { "content-type": "application/json; charset=utf-8" },
    ...init,
  });

const notFound = (msg: string) => json({ success: false, error: msg }, { status: 404 });
const badRequest = (msg: string) => json({ success: false, error: msg }, { status: 400 });

function makeKey(email: string, id: number) {
  return `book:${email}:${id}`;
}

async function nextId(kv: KVNamespace, email: string): Promise<number> {
  // KV has no atomic increment; use time-based id with a small random offset to reduce collision risk.
  // For most cases, Date.now() is enough. Ensure monotonic-ish per email by also checking a stored seq.
  const seqKey = `seq:${email}`;
  const current = (await kv.get(seqKey)) || "0";
  const now = Date.now();
  const candidate = Math.max(parseInt(current, 10) + 1, now);
  await kv.put(seqKey, String(candidate));
  return candidate;
}

async function listBooksByEmail(kv: KVNamespace, email: string): Promise<Book[]> {
  const prefix = `book:${email}:`;
  const keys = await kv.list({ prefix });
  const results: Book[] = [];
  for (const { name: key } of keys.keys) {
    const book = await kv.get<Book>(key, "json");
    if (book) results.push(book);
  }
  // sort by id for determinism
  results.sort((a, b) => a.bookId - b.bookId);
  return results;
}

async function listAllBooks(kv: KVNamespace): Promise<Book[]> {
  const keys = await kv.list({ prefix: "book:" });
  const results: Book[] = [];
  for (const { name: key } of keys.keys) {
    const book = await kv.get<Book>(key, "json");
    if (book) results.push(book);
  }
  results.sort((a, b) => a.bookId - b.bookId);
  return results;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const method = request.method.toUpperCase();

    // Routes:
    // GET /api/:email/books
    // POST /api/:email/books
    // GET /api/:email/allbooks
    // GET /api/:email/reset

    const segments = url.pathname.replace(/^\/+|\/+$/g, "").split("/"); // trim slashes, split
    if (segments.length < 3 || segments[0] !== "api") {
      return notFound("Route not found");
    }
    const email = decodeURIComponent(segments[1] || "");

    // Simple validation
    if (!email || !email.includes("@")) {
      return badRequest("Invalid or missing email in path.");
    }

    const tail = segments.slice(2).join("/");

    try {
      if (method === "GET" && tail === "books") {
        const books = await listBooksByEmail(env.BOOKS, email);
        const resp: ApiResponse<Book[]> = { success: true, result: books };
        return json(resp);
      }

      if (method === "GET" && tail === "allbooks") {
        const books = await listAllBooks(env.BOOKS);
        const resp: ApiResponse<Book[]> = { success: true, result: books };
        return json(resp);
      }

      if (method === "POST" && tail === "books") {
        const body = await request.json().catch(() => null) as Partial<Book> | null;
        if (!body || !body.name || !body.author) {
          return badRequest("Body must include 'name' and 'author'.");
        }
        const id = await nextId(env.BOOKS, email);
        const book: Book = {
          bookId: id,
          name: String(body.name),
          author: String(body.author),
          ownerId: email,
        };
        await env.BOOKS.put(makeKey(email, id), JSON.stringify(book));
        const resp: ApiResponse<Book> = { success: true, result: book };
        return json(resp, { status: 201 });
      }

      if (method === "GET" && tail === "reset") {
        // delete all keys for this email + its seq
        const keys = await env.BOOKS.list({ prefix: `book:${email}:` });
        await Promise.all(keys.keys.map(k => env.BOOKS.delete(k.name)));
        await env.BOOKS.delete(`seq:${email}`);
        return json({ success: true, result: { deleted: keys.keys.length } });
      }

      return notFound("Route not found");
    } catch (err: any) {
      return json({ success: false, error: err?.message ?? String(err) }, { status: 500 });
    }
  },
};
