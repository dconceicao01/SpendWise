import { TextInput, type TextInputProps } from "react-native";

type DateInputProps = Omit<TextInputProps, "value" | "onChangeText"> & {
  value: string;
  onChangeText: (value: string) => void;
};

export function DateInput(props: DateInputProps) {
  return <TextInput {...props} {...({ type: "date" } as object)} />;
}
