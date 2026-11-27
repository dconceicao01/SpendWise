import DateTimePicker, {
  DateTimePickerAndroid,
} from "@react-native-community/datetimepicker";
import {
  Platform,
  Pressable,
  Text,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import { useTranslation } from "react-i18next";

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
  const { i18n } = useTranslation();
  const parsed = value ? new Date(`${value}T12:00:00`) : new Date();
  const safeValue = Number.isNaN(parsed.getTime()) ? new Date() : parsed;

  const handleChange = (date?: Date) => {
    if (!date) return;
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    onChangeText(`${year}-${month}-${day}`);
  };

  if (Platform.OS === "android") {
    const formattedDate = new Intl.DateTimeFormat(i18n.language, {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    }).format(safeValue);

    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={
          accessibilityLabel
            ? `${accessibilityLabel}: ${formattedDate}`
            : formattedDate
        }
        onPress={() =>
          DateTimePickerAndroid.open({
            value: safeValue,
            mode: "date",
            display: "default",
            minimumDate,
            onValueChange: (_event, date) => handleChange(date),
          })
        }
        style={style as StyleProp<ViewStyle>}
      >
        <Text style={dateTextStyle}>{formattedDate}</Text>
      </Pressable>
    );
  }

  return (
    <View style={style as StyleProp<ViewStyle>}>
      <DateTimePicker
        accessibilityLabel={accessibilityLabel}
        value={safeValue}
        onChange={(event, date) => event.type === "set" && handleChange(date)}
        mode="date"
        display="compact"
        minimumDate={minimumDate}
      />
    </View>
  );
}

const dateTextStyle: TextStyle = {
  color: "#18291f",
  fontSize: 16,
  textAlignVertical: "center",
  includeFontPadding: false,
  flex: 1,
};
