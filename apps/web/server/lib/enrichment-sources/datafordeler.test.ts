import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  candidateBases,
  entityFields,
  foldFieldName,
  GraphQlError,
  pickField,
  postGraphQl,
  resetDatafordelerCache,
  type DatafordelerService,
} from "./datafordeler.js";
import { stubFetch } from "../test-support/stub-fetch.js";

const SERVICE: DatafordelerService = {
  register: "VUR",
  versionEnv: "DATAFORDELER_VUR_VERSION",
  baseEnv: "DATAFORDELER_VUR_API_BASE",
  versions: ["v2", "v3", "v1"],
};

beforeEach(() => {
  resetDatafordelerCache();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("candidateBases", () => {
  it("tries the known versions in order when nothing is pinned", () => {
    expect(candidateBases(SERVICE)).toEqual([
      "https://graphql.datafordeler.dk/VUR/v2",
      "https://graphql.datafordeler.dk/VUR/v3",
      "https://graphql.datafordeler.dk/VUR/v1",
    ]);
  });

  it("treats a pinned version or endpoint as deliberate and probes nothing around it", () => {
    vi.stubEnv("DATAFORDELER_VUR_VERSION", "v9");
    expect(candidateBases(SERVICE)).toEqual(["https://graphql.datafordeler.dk/VUR/v9"]);

    vi.stubEnv("DATAFORDELER_VUR_API_BASE", "https://mirror.example/VUR/v2/");
    expect(candidateBases(SERVICE)).toEqual(["https://mirror.example/VUR/v2"]);
  });
});

describe("postGraphQl", () => {
  it("moves past a withdrawn version and stays on the one that answered", async () => {
    const stub = stubFetch([{ status: 404 }, { body: { data: { ok: true } } }]);

    expect(await postGraphQl(SERVICE, "k", "{ ok }")).toEqual({ ok: true });
    expect(stub.urls[0]).toContain("/VUR/v2");
    expect(stub.urls[1]).toContain("/VUR/v3");

    await postGraphQl(SERVICE, "k", "{ ok }");
    expect(stub.urls[2]).toContain("/VUR/v3");
  });

  it("reports the 404 when no candidate version answers", async () => {
    stubFetch([{ status: 404 }]);
    await expect(postGraphQl(SERVICE, "k", "{ ok }")).rejects.toThrow("HTTP 404");
  });

  it("raises a GraphQlError that can tell an unknown argument from any other rejection", async () => {
    stubFetch([
      {
        body: {
          errors: [{ message: "The argument `registreringstid` does not exist." }, { message: "and another thing" }],
        },
      },
    ]);

    const error = await postGraphQl(SERVICE, "k", "{ ok }").catch((err: unknown) => err);
    expect(error).toBeInstanceOf(GraphQlError);
    expect((error as GraphQlError).hasUnknownArgument).toBe(true);
    expect((error as GraphQlError).message).toContain("and another thing");

    expect(new GraphQlError(["The field `x` does not exist on the type `Y`."]).hasUnknownArgument).toBe(false);
  });
});

describe("entityFields", () => {
  it("reads the type's field names once and serves the rest from cache", async () => {
    const stub = stubFetch([{ body: { data: { __type: { fields: [{ name: "bfeNummer" }] } } } }]);

    expect(await entityFields(SERVICE, "k", "VUR_Ejendomsvurdering")).toEqual(new Set(["bfeNummer"]));
    expect(await entityFields(SERVICE, "k", "VUR_Ejendomsvurdering")).toEqual(new Set(["bfeNummer"]));
    expect(stub.urls).toHaveLength(1);
  });

  it("returns null when the schema has no such type", async () => {
    stubFetch([{ body: { data: { __type: null } } }]);
    expect(await entityFields(SERVICE, "k", "VUR_Nope")).toBeNull();
  });
});

describe("pickField", () => {
  it("prefers an exact match over a longer field that starts with the term", () => {
    expect(pickField(["ejendomsvaerdiBeloeb", "ejendomsvaerdi"], "ejendomsvaerdi")).toBe("ejendomsvaerdi");
  });

  it("accepts a suffixed spelling and takes the shortest of them", () => {
    expect(pickField(["ejendomsvaerdiBeloebSenest", "ejendomsvaerdiBeloeb"], "ejendomsvaerdi")).toBe(
      "ejendomsvaerdiBeloeb",
    );
  });

  it("tries the terms in preference order", () => {
    expect(pickField(["vurderingAar", "kommunekode"], "vurderingsaar", "vurderingaar")).toBe("vurderingAar");
  });

  it("never matches a field that only mentions the term", () => {
    expect(pickField(["omraadeGrundvaerdiKode"], "grundvaerdi")).toBeNull();
  });
});

describe("foldFieldName", () => {
  it("folds Danish letters onto Datafordeler's ASCII transliteration", () => {
    expect(foldFieldName("byg026Opførelsesår")).toBe(foldFieldName("byg026Opfoerelsesaar"));
    expect(foldFieldName("Ejendomsværdi")).toBe("ejendomsvaerdi");
  });
});
