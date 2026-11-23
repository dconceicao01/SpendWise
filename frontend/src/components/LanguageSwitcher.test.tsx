import { fireEvent, render, waitFor } from "@testing-library/react-native";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { changeLanguage } from "@/i18n/i18n";

jest.mock("@/i18n/i18n", () => ({ changeLanguage: jest.fn() }));
jest.mock("react-i18next", () => ({
  useTranslation: () => ({
    i18n: { language: "pt" },
    t: (_key: string, options: { language: string }) =>
      `Mudar idioma para ${options.language}`,
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
      getByRole("button", { name: "Mudar idioma para English" }),
    ).toHaveTextContent("EN");
  });

  it("changes to English when the Portuguese switch is pressed", async () => {
    const { getByRole } = await render(<LanguageSwitcher />);

    fireEvent.press(getByRole("button", { name: "Mudar idioma para English" }));

    await waitFor(() => {
      expect(changeLanguage).toHaveBeenCalledWith("en");
    });
  });
});
