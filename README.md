# UFT mini-clone 

> Clone of LogicRoom's public "books API" used in the courses
> Ultra Fast Testing and Infinite Architecture (made by Pete Hearn)
> built using _Cloudflare Workers Durable Objects_ + _Miniflare_ for local dev

A tiny API that lists and adds books using **Cloudflare Durable Objects**.
Runs locally with **Miniflare** from the latest Workers SDK and deploys with **Wrangler**.

Vibe coded in minutes with ChatGPT to serve a purpose of toying with some
old codesandbox.io sandboxes from the UFT course. Meant to work wit

- https://github.com/fatso83/uft-module-6/blob/main/src/Books/Books.test.js

## Endpoints

All responses use `content-type: application/json`.

- `GET /api/:email/books` → list books for `:email`
- `POST /api/:email/books` → add a book for `:email`
  ```json
  { "name": "my private book", "author": "my private author" }
  ```
- `GET /api/:email/allbooks` → list books across all emails
- `GET /api/:email/reset` → delete all books for `:email` (and reset its sequence)

## Quickstart

Replace `bun` with `npm` or `yarn`

```bash
bun i    # or npm i / yarn
bun dev  # local dev on http://127.0.0.1:8787
```

## Test with Miniflare + Vitest

```bash
bun test
```

## Deploy

1. Create a KV namespace and bind it to `BOOKS` in your Cloudflare account:
   ```bash
   wrangler kv:namespace create BOOKS
   wrangler kv:namespace create BOOKS --preview
   ```
2. Put the generated IDs in `wrangler.toml` under the `[[kv_namespaces]]` entry.
3. Deploy:
   ```bash
   pnpm deploy
   ```

## cURL Examples

```bash
# Reset (optional)
curl -s http://127.0.0.1:8787/api/pete%40logicroom.co/reset

# Add
curl -s -X POST http://127.0.0.1:8787/api/pete%40logicroom.co/books   -H 'content-type: application/json'   -d '{"name":"Wind in the willows","author":"Kenneth Graeme"}'

# List by email
curl -s http://127.0.0.1:8787/api/pete%40logicroom.co/books

# All books across users (hitting any email path works; email is ignored for this route)
curl -s http://127.0.0.1:8787/api/pete%40logicroom.co/allbooks
```

## Notes

- Keys are stored as `book:<email>:<bookId>`. A simple per-email sequence is kept at `seq:<email>`.
- KV has eventual consistency; IDs use a monotonic-ish sequence blending `Date.now()`.
- `allbooks` enumerates all `book:` keys in the bound KV namespace.
