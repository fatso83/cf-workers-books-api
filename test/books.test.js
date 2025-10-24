import { beforeEach, describe, expect, it } from "vitest";

import { Miniflare } from "miniflare";

async function mfFetch(mf, path, init) {
  const url = new URL(path, "http://localhost");
  return mf.dispatchFetch(url, init);
}

describe("Books API", () => {
  let mf;

  beforeEach(async () => {
    mf = new Miniflare({
      modules: true,
      scriptPath: "src/worker.js",
      kvNamespaces: ["BOOKS"],
    });
    await mf.dispatchFetch("http://localhost/api/pete%40logicroom.co/reset");
  });

  it("lists empty books for new email", async () => {
    const res = await mfFetch(mf, "/api/pete%40logicroom.co/books");
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.result).toEqual([]);
  });

  it("adds a book and lists it", async () => {
    const add = await mfFetch(mf, "/api/pete%40logicroom.co/books", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Wind in the willows", author: "Kenneth Graeme" }),
    });
    expect(add.status).toBe(201);
    const created = await add.json();
    expect(created.success).toBe(true);
    expect(created.result.name).toBe("Wind in the willows");
    expect(created.result.ownerId).toBe("pete@logicroom.co");

    const list = await mfFetch(mf, "/api/pete%40logicroom.co/books");
    const payload = await list.json();
    expect(payload.result.length).toBe(1);
    expect(payload.result[0].author).toBe("Kenneth Graeme");
  });

  it("supports allbooks across users", async () => {
    await mfFetch(mf, "/api/pete%40logicroom.co/books", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "I, Robot", author: "Isaac Asimov" }),
    });
    await mfFetch(mf, "/api/jane%40example.com/books", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "The Hobbit", author: "Jrr Tolkein" }),
    });

    const res = await mfFetch(mf, "/api/pete%40logicroom.co/allbooks");
    const data = await res.json();
    expect(data.success).toBe(true);
    const names = data.result.map((b) => b.name).sort();
    expect(names).toEqual(["I, Robot", "The Hobbit"]);
  });

  it("resets per email", async () => {
    await mfFetch(mf, "/api/pete%40logicroom.co/books", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Moby Dick", author: "Herman Melville" }),
    });
    const before = await mfFetch(mf, "/api/pete%40logicroom.co/books");
    const bjson = await before.json();
    expect(bjson.result.length).toBe(1);

    const reset = await mfFetch(mf, "/api/pete%40logicroom.co/reset");
    expect(reset.status).toBe(200);

    const after = await mfFetch(mf, "/api/pete%40logicroom.co/books");
    const ajson = await after.json();
    expect(ajson.result.length).toBe(0);
  });
});
