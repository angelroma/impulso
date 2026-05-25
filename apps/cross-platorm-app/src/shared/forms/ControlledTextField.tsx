import { Control, FieldValues, Path, useController } from 'react-hook-form';

import { TextField, TextFieldProps } from '../ui';

type ControlledTextFieldProps<TValues extends FieldValues> = Omit<
  TextFieldProps,
  'error' | 'onBlur' | 'onChangeText' | 'value'
> & {
  control: Control<TValues>;
  name: Path<TValues>;
};

export function ControlledTextField<TValues extends FieldValues>({
  control,
  name,
  ...props
}: ControlledTextFieldProps<TValues>) {
  const {
    field,
    fieldState: { error },
  } = useController({ control, name });

  return (
    <TextField
      error={error?.message}
      onBlur={field.onBlur}
      onChangeText={field.onChange}
      value={field.value ?? ''}
      {...props}
    />
  );
}
