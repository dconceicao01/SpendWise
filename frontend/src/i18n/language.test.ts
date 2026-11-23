import { resolveDeviceLanguage } from "@/i18n/language";

describe("resolveDeviceLanguage", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("selects Portuguese for Portuguese device locales", () => {
    jest.spyOn(Intl, "DateTimeFormat").mockImplementation(
      () =>
        ({
          resolvedOptions: () => ({ locale: "pt-PT" }),
        }) as Intl.DateTimeFormat,
    );

    expect(resolveDeviceLanguage()).toBe("pt");
  });

  it.each(["en-GB", "es-ES", "fr-FR"])(
    "falls back to English for %s device locales",
    (locale) => {
      jest
        .spyOn(Intl, "DateTimeFormat")
        .mockImplementation(
          () =>
            ({ resolvedOptions: () => ({ locale }) }) as Intl.DateTimeFormat,
        );

      expect(resolveDeviceLanguage()).toBe("en");
      jest.restoreAllMocks();
    },
  );
});
