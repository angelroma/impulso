import { Input, InputProps, Label, Text, YStack } from 'tamagui';

export type TextFieldProps = InputProps & {
  error?: string;
  label: string;
};

export function TextField({ error, id, label, ...inputProps }: TextFieldProps) {
  const fieldId = id ?? label.toLowerCase().replaceAll(/\s+/g, '-');

  return (
    <YStack gap="$2">
      <Label color="$color" fontWeight="700" htmlFor={fieldId}>
        {label}
      </Label>
      <Input
        borderColor={error ? '$red8' : '$borderColor'}
        id={fieldId}
        {...inputProps}
      />
      {error ? (
        <Text color="$red10" fontSize="$3" role="alert">
          {error}
        </Text>
      ) : null}
    </YStack>
  );
}
