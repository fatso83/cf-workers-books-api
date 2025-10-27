# UFT mini-clone 

> Clone of LogicRoom's public "books API" used in the courses
> Ultra Fast Testing and Infinite Architecture (made by Pete Hearn)
> built using _Cloudflare Workers Durable Objects_ + _Miniflare_ for local dev

A tiny API that lists and adds books using **Cloudflare Durable Objects**.
Runs locally with **Miniflare** from the latest Workers SDK and deploys with **Wrangler**.

Meant to work with [module 6 of Ultra Fast Testing](https://github.com/fatso83/uft-module-6)

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
bun run test
```

## Deploy

```bash
bun run deploy
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
