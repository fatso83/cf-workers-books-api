/**
 * @typedef {Object} Book
 * @property {number} bookId
 * @property {string} name
 * @property {string} ownerId
 * @property {string} author
 */

/**
 * @template T
 * @typedef {Object} ApiResponse
 * @property {boolean} success
 * @property {T} result
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,HEAD,POST,OPTIONS",
  "Access-Control-Max-Age": "86400",
};

async function handleOptions(request) {
  if (
    request.headers.get("Origin") !== null &&
    request.headers.get("Access-Control-Request-Method") !== null &&
    request.headers.get("Access-Control-Request-Headers") !== null
  ) {
    // Handle CORS preflight requests.
    return new Response(null, {
      headers: {
        ...corsHeaders,
        "Access-Control-Allow-Headers": request.headers.get(
          "Access-Control-Request-Headers",
        ),
      },
    });
  } else {
    // Handle standard OPTIONS request.
    return new Response(null, {
      headers: {
        Allow: "GET, HEAD, POST, OPTIONS",
      },
    });
  }
}

const json = (data, init = {}) =>
  new Response(JSON.stringify(data, null, 2), {
    headers: { "content-type": "application/json; charset=utf-8" },
    ...init,
  });

const notFound = (msg) => json({ success: false, error: msg }, { status: 404 });
const badRequest = (msg) =>
  json({ success: false, error: msg }, { status: 400 });

function makeKey(email, id) {
  return `book:${email}:${id}`;
}

// KV has no atomic increment; use time-based id with a small random offset to reduce collision risk.
// For most cases, Date.now() is enough. Ensure monotonic-ish per email by also checking a stored seq.
async function nextId(kv, email) {
  const seqKey = `seq:${email}`;
  const current = (await kv.get(seqKey)) || "0";
  const now = Date.now();
  const candidate = Math.max(parseInt(current, 10) + 1, now);
  await kv.put(seqKey, String(candidate));
  return candidate;
}

async function listBooksByEmail(kv, email) {
  const prefix = `book:${email}:`;
  const keys = await kv.list({ prefix });
  /** @type {Book[]} */
  const results = [];
  for (const { name: key } of keys.keys) {
    const book = await kv.get(key, "json");
    if (book) results.push(/** @type {Book} */ (book));
  }
  results.sort((a, b) => a.bookId - b.bookId);
  return results;
}

async function listAllBooks(kv) {
  const keys = await kv.list({ prefix: "book:" });
  /** @type {Book[]} */
  const results = [];
  for (const { name: key } of keys.keys) {
    const book = await kv.get(key, "json");
    if (book) results.push(/** @type {Book} */ (book));
  }
  results.sort((a, b) => a.bookId - b.bookId);
  return results;
}

function withCors(response) {
  const newHeaders = new Headers(response.headers);
  newHeaders.set("Access-Control-Allow-Origin", "*");
  newHeaders.set("Access-Control-Allow-Methods", "GET,HEAD,POST,OPTIONS");
  newHeaders.set("Access-Control-Max-Age", "86400");
  return new Response(response.body, {
    ...response,
    headers: newHeaders,
  });
}

export default {
  /**
   * @param {Request} request
   * @param {{ BOOKS: KVNamespace }} env
   * @returns {Promise<Response>}
   */
  async fetch(request, env) {
    try {
      const response = await handleRequest(request, env);
      return withCors(response);
    } catch (err) {
      return withCors(
        new Response(JSON.stringify({ success: false, error: err.message }), {
          status: 500,
          headers: { "content-type": "application/json" },
        }),
      );
    }
  },

  async handleRequest(request, env) {
    const url = new URL(request.url);
    const method = request.method.toUpperCase();

    // Routes:
    // GET /api/:email/books
    // POST /api/:email/books
    // GET /api/:email/allbooks
    // GET /api/:email/reset
    //
    const segments = url.pathname.replace(/^\/+|\/+$/g, "").split("/");
    if (segments.length < 3 || segments[0] !== "api") {
      return notFound("Route not found");
    }
    const email = decodeURIComponent(segments[1] || "");

    if (!email || !email.includes("@")) {
      return badRequest("Invalid or missing email in path.");
    }

    const tail = segments.slice(2).join("/");

    try {
      if (method === "OPTIONS") {
        // Handle CORS preflight requests
        return handleOptions(request);
      }

      if (method === "GET" && tail === "books") {
        const books = await listBooksByEmail(env.BOOKS, email);
        /** @type {ApiResponse<Book[]>} */
        const resp = { success: true, result: books };
        return json(resp);
      }

      if (method === "GET" && tail === "allbooks") {
        const books = await listAllBooks(env.BOOKS);
        /** @type {ApiResponse<Book[]>} */
        const resp = { success: true, result: books };
        return json(resp);
      }

      if (method === "POST" && tail === "books") {
        const body = /** @type {Partial<Book> | null} */ (
          await request.json().catch(() => null)
        );
        if (!body || !body.name || !body.author) {
          return badRequest("Body must include 'name' and 'author'.");
        }
        const id = await nextId(env.BOOKS, email);
        /** @type {Book} */
        const book = {
          bookId: id,
          name: String(body.name),
          author: String(body.author),
          ownerId: email,
        };
        await env.BOOKS.put(makeKey(email, id), JSON.stringify(book));
        /** @type {ApiResponse<Book>} */
        const resp = { success: true, result: book };
        return json(resp, { status: 201 });
      }

      if (method === "GET" && tail === "reset") {
        const keys = await env.BOOKS.list({ prefix: `book:${email}:` });
        await Promise.all(keys.keys.map((k) => env.BOOKS.delete(k.name)));
        await env.BOOKS.delete(`seq:${email}`);
        return json({ success: true, result: { deleted: keys.keys.length } });
      }

      return notFound("Route not found");
    } catch (err) {
      const message =
        err && typeof err === "object" && "message" in err
          ? err.message
          : String(err);
      return json({ success: false, error: message }, { status: 500 });
    }
  },
};
