import { Pressable, StyleSheet, Text, TextStyle, ViewStyle } from 'react-native';

interface PlatformButtonProps {
  label: string;
  onPress: () => void;
  onLongPress?: () => void;
  style?: ViewStyle;
  labelStyle?: TextStyle;
}

export function PlatformButton({ label, onPress, onLongPress, style, labelStyle }: PlatformButtonProps) {
  return (
    <Pressable style={[styles.button, style]} onPress={onPress} onLongPress={onLongPress}>
      <Text style={[styles.text, labelStyle]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    backgroundColor: '#4B7BEC',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginBottom: 12,
  },
  text: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
  },
});
