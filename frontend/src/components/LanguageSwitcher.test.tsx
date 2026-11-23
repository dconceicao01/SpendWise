import { fireEvent, render, waitFor } from "@testing-library/react-native";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { changeLanguage } from "@/i18n/i18n";

jest.mock("@/i18n/i18n", () => ({ changeLanguage: jest.fn() }));
jest.mock("react-i18next", () => ({
  useTranslation: () => ({
    i18n: { language: "pt" },
    t: (key: string, options?: { language: string }) => {
      if (key === "common.languagePortuguese") return "português";
      if (key === "common.languageEnglish") return "inglês";
      return `Mudar idioma para ${options?.language}`;
    },
  }),
}));

describe("LanguageSwitcher", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(changeLanguage).mockResolvedValue(undefined);
  });

  it("shows an accessible button for the next language", async () => {
    const { getByRole } = await render(<LanguageSwitcher />);

    expect(
      getByRole("button", { name: "EN. Mudar idioma para inglês" }),
    ).toHaveTextContent("EN");
  });

  it("changes to English when the Portuguese switch is pressed", async () => {
    const { getByRole } = await render(<LanguageSwitcher />);

    fireEvent.press(
      getByRole("button", { name: "EN. Mudar idioma para inglês" }),
    );

    await waitFor(() => {
      expect(changeLanguage).toHaveBeenCalledWith("en");
    });
  });
});
