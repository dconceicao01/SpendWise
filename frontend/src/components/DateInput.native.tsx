import DateTimePicker from "@react-native-community/datetimepicker";
import {
  Platform,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from "react-native";

type DateInputProps = {
  value: string;
  onChangeText: (value: string) => void;
  accessibilityLabel?: string;
  minimumDate?: Date;
  style?: StyleProp<ViewStyle | TextStyle>;
};

export function DateInput({
  value,
  onChangeText,
  accessibilityLabel,
  minimumDate,
  style,
}: DateInputProps) {
  const parsed = value ? new Date(`${value}T12:00:00`) : new Date();
  const safeValue = Number.isNaN(parsed.getTime()) ? new Date() : parsed;
  return (
    <View style={style as StyleProp<ViewStyle>}>
      <DateTimePicker
        accessibilityLabel={accessibilityLabel}
        value={safeValue}
        onChange={(event, date) => {
          if (event.type !== "set" || !date) return;
          const year = date.getFullYear();
          const month = String(date.getMonth() + 1).padStart(2, "0");
          const day = String(date.getDate()).padStart(2, "0");
          onChangeText(`${year}-${month}-${day}`);
        }}
        mode="date"
        display={Platform.OS === "ios" ? "compact" : "default"}
        minimumDate={minimumDate}
      />
    </View>
  );
}
