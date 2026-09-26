import React, { useRef } from 'react';
import { TextInput, TextInputProps } from 'react-native';

interface SanitizedTextInputProps extends Omit<TextInputProps, 'onChangeText'> {
  value: string;
  onChangeText: (text: string) => void;
  sanitize: (text: string) => string;
}

// Controlled TextInput + a sanitizer that strips a just-typed invalid char
// (e.g. a letter in a phone field) can leave that char on screen even
// though state never has it: if the sanitized result equals the PREVIOUS
// value, React sees no prop change and skips re-rendering the native view,
// so the native text still shows what was actually typed. setNativeProps
// forces the native text back in sync without a remount, so it doesn't
// steal focus or the cursor.
export const SanitizedTextInput: React.FC<SanitizedTextInputProps> = ({ value, onChangeText, sanitize, ...rest }) => {
  const ref = useRef<TextInput>(null);

  return (
    <TextInput
      ref={ref}
      {...rest}
      value={value}
      onChangeText={(text) => {
        const filtered = sanitize(text);
        if (filtered !== text) {
          ref.current?.setNativeProps({ text: filtered });
        }
        onChangeText(filtered);
      }}
    />
  );
};
